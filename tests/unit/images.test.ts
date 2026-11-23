import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  mkdir: vi.fn(),
  read: vi.fn(),
  request: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  writeFile: mocks.write,
  mkdir: mocks.mkdir,
  readFile: mocks.read,
}));
vi.mock('node:http', () => ({ request: mocks.request }));
import {
  imageType,
  publicImageAddress,
  validateImageUrl,
  storeImage,
  loadImage,
  boundedImageBody,
  maxImageBytes,
} from '../../lib/images';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0Z8AAAAASUVORK5CYII=',
  'base64',
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.write.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue(png);
});
it('stores a validated local image with a generated filename and reads it within the store', async () => {
  const url = await storeImage('store', 'image/png', png);
  expect(url).toMatch(/^\/api\/images\/[0-9a-f-]+\.png$/);
  expect(mocks.write).toHaveBeenCalledWith(
    expect.stringContaining('/store/'),
    png,
    { flag: 'wx' },
  );
  expect((await loadImage('store', url.split('/').at(-1)!)).mime).toBe(
    'image/png',
  );
  await expect(loadImage('store', '../secret.png')).rejects.toThrow(
    'Không tìm thấy',
  );
});
it('rejects empty, oversized, spoofed and active-content image uploads', () => {
  expect(() => imageType('image/png', new Uint8Array())).toThrow('dữ liệu');
  expect(() =>
    imageType('image/png', new Uint8Array(maxImageBytes + 1)),
  ).toThrow('2 MB');
  expect(() => imageType('image/png', Buffer.from('<html>'))).toThrow(
    'không khớp',
  );
  expect(() => imageType('image/svg+xml', Buffer.from('<svg/>'))).toThrow(
    'không SVG',
  );
});
it('blocks private, mapped, metadata and loopback network targets', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])
    expect(publicImageAddress(ip)).toBe(false);
  expect(publicImageAddress('8.8.8.8')).toBe(true);
  await expect(
    validateImageUrl('http://127.0.0.1/api/admin/products', 'store'),
  ).rejects.toThrow('máy chủ công khai');
  expect(mocks.request).not.toHaveBeenCalled();
});
it('requires actual image content and a direct successful remote response', async () => {
  let type = 'application/json';
  mocks.request.mockImplementation((_url, _options, handler) => ({
    on() {
      return this;
    },
    end() {
      handler({
        statusCode: 200,
        headers: { 'content-type': type },
        resume() {},
        destroy() {},
        on(event: string, callback: (value?: Buffer) => void) {
          if (event === 'data') callback(png);
          if (event === 'end') callback();
          return this;
        },
      });
    },
  }));
  await expect(
    validateImageUrl('http://8.8.8.8/picture', 'store'),
  ).rejects.toThrow('URL phải là ảnh');
  type = 'image/png';
  await expect(
    validateImageUrl('http://8.8.8.8/picture', 'store'),
  ).resolves.toBeUndefined();
  await expect(validateImageUrl('', 'store')).resolves.toBeUndefined();
});
it('bounds streamed multipart bodies even without Content-Length', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(12));
      controller.close();
    },
  });
  await expect(boundedImageBody(stream, 10)).rejects.toThrow('quá 2 MB');
});
