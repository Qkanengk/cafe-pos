import { NextRequest, NextResponse } from 'next/server';
import { apiUser, apiError, HttpError } from '@/lib/api';
import {
  boundedImageBody,
  storeImage,
  ImageError,
  maxImageBytes,
} from '@/lib/images';
export async function POST(request: NextRequest) {
  try {
    const user = await apiUser(request);
    if (user.role !== 'OWNER')
      throw new HttpError('Chỉ chủ quán có quyền tải ảnh', 403);
    if (
      Number(request.headers.get('content-length') ?? 0) >
      maxImageBytes + 65536
    )
      throw new ImageError('Tệp tải lên quá 2 MB.', 413);
    const body = await boundedImageBody(request.body);
    const form = await new Response(body, {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ImageError('Vui lòng chọn ảnh.');
    const imageUrl = await storeImage(
      user.storeId,
      file.type,
      new Uint8Array(await file.arrayBuffer()),
    );
    return NextResponse.json({ imageUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return apiError(error);
  }
}
