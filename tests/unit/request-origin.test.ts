import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requestOrigin, validOrigin } from '../../lib/request-origin';

describe('standalone request origin', () => {
  it('uses the public host rather than the container bind address', () => {
    const request = new NextRequest('http://0.0.0.0:3000/api/auth/login', {
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });
    expect(requestOrigin(request)).toBe('http://localhost:3000');
    expect(validOrigin(request)).toBe(true);
  });
  it('accepts requests without an origin and rejects foreign origins', () => {
    expect(validOrigin(new NextRequest('http://localhost:3000'))).toBe(true);
    expect(
      validOrigin(
        new NextRequest('http://localhost:3000', {
          headers: {
            host: 'localhost:3000',
            origin: 'https://foreign.example',
          },
        }),
      ),
    ).toBe(false);
  });
});
