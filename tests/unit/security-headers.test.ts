import { it, expect } from 'vitest';
import { secureResponse } from '../../worker/security/headers';
it('preserves private-page referrer protection and applies other security headers', async () => {
  const response = await secureResponse(
    new Response('private', {
      headers: {
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
      },
    }),
  );
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "frame-ancestors 'none'",
  );
  expect(
    (await secureResponse(new Response('public'))).headers.get(
      'Referrer-Policy',
    ),
  ).toBe('strict-origin-when-cross-origin');
});
