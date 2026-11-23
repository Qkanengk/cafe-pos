import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
export const maxImageBytes = 2 * 1024 * 1024;
export class ImageError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const formats: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
export function imageType(type: string, data: Uint8Array) {
  const mime = type.split(';')[0].trim().toLowerCase();
  if (!formats[mime])
    throw new ImageError('Chỉ nhận ảnh PNG, JPEG, GIF hoặc WebP (không SVG).');
  if (data.byteLength === 0 || data.byteLength > maxImageBytes)
    throw new ImageError('Ảnh phải có dữ liệu và không quá 2 MB.');
  const bytes = Buffer.from(data);
  const valid =
    mime === 'image/png'
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === 'image/gif'
          ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
          : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new ImageError('Nội dung tệp không khớp định dạng ảnh.');
  return mime;
}
const blocked4 = new BlockList(),
  blocked6 = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked4.addSubnet(address, bits, 'ipv4');
for (const [address, bits] of [
  ['::', 96],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2001::', 32],
  ['64:ff9b::', 96],
] as const)
  blocked6.addSubnet(address, bits, 'ipv6');
export function publicImageAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked4.check(address, 'ipv4')
    : family === 6
      ? !blocked6.check(address, 'ipv6')
      : false;
}
function imagePath(storeId: string, name: string) {
  if (
    !/^[a-zA-Z0-9-]+$/.test(storeId) ||
    !/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(name)
  )
    throw new ImageError('Không tìm thấy ảnh', 404);
  return path.join(
    process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'),
    storeId,
    name,
  );
}
export async function storeImage(
  storeId: string,
  type: string,
  data: Uint8Array,
) {
  const mime = imageType(type, data),
    name = randomUUID() + '.' + formats[mime],
    file = imagePath(storeId, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data, { flag: 'wx' });
  return '/api/images/' + name;
}
export async function loadImage(storeId: string, name: string) {
  const file = imagePath(storeId, name);
  try {
    const data = await readFile(file);
    const ext = name.split('.').at(-1);
    const mime = Object.keys(formats).find((type) => formats[type] === ext)!;
    imageType(mime, data);
    return { data, mime };
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError('Không tìm thấy ảnh', 404);
  }
}
export async function validateImageUrl(value: string, storeId: string) {
  if (!value) return;
  if (value.startsWith('/api/images/')) {
    await loadImage(storeId, value.slice('/api/images/'.length));
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ImageError('URL ảnh không hợp lệ.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ImageError('Chỉ nhận URL ảnh http/https không kèm tài khoản.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      isIP(hostname)
        ? Promise.resolve([{ address: hostname, family: isIP(hostname) }])
        : lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ImageError('Kiểm tra ảnh quá lâu. Thử tải ảnh từ thiết bị.'),
            ),
          8000,
        );
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some(({ address }) => !publicImageAddress(address))
    )
      throw new ImageError(
        'URL ảnh phải dùng máy chủ công khai. Ảnh nội bộ hãy tải từ thiết bị.',
      );
    const address = addresses[0];
    await new Promise<void>((resolve, reject) => {
      const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          method: 'GET',
          signal: AbortSignal.timeout(8000),
          maxHeaderSize: 16384,
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(
              new ImageError(
                'URL phải trỏ trực tiếp tới ảnh đang truy cập được (không chuyển hướng).',
              ),
            );
            return;
          }
          const type = res.headers['content-type'] ?? '';
          if (
            !formats[type.split(';')[0].trim().toLowerCase()] ||
            Number(res.headers['content-length'] ?? 0) > maxImageBytes
          ) {
            res.destroy();
            reject(
              new ImageError(
                'URL phải là ảnh PNG/JPEG/GIF/WebP không quá 2 MB.',
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          res.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > maxImageBytes) {
              res.destroy();
              reject(new ImageError('Ảnh không được quá 2 MB.'));
            } else chunks.push(chunk);
          });
          res.on('end', () => {
            try {
              imageType(type, Buffer.concat(chunks));
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          res.on('error', () =>
            reject(new ImageError('Không thể đọc nội dung ảnh.')),
          );
        },
      );
      req.on('error', () =>
        reject(
          new ImageError(
            'Không thể kiểm tra ảnh trong 8 giây. Hãy tải ảnh từ thiết bị.',
          ),
        ),
      );
      req.end();
    });
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError('Không thể kiểm tra URL ảnh.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function boundedImageBody(
  stream: ReadableStream<Uint8Array> | null,
  limit = maxImageBytes + 65536,
) {
  if (!stream) throw new ImageError('Chưa chọn ảnh.');
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ImageError('Tệp tải lên quá 2 MB.', 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}
