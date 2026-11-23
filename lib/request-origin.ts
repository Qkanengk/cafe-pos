import type { NextRequest } from 'next/server';

export function requestOrigin(request: NextRequest): string {
  const url = new URL(request.url);
  url.host = request.headers.get('host') ?? url.host;
  return url.origin;
}

export function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === requestOrigin(request);
}
