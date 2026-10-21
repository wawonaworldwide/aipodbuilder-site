import { themeBootstrap } from '../../src/lib/theme';
let themeHash: Promise<string> | undefined;
export async function secureResponse(
  response: Response,
  preview = false,
): Promise<Response> {
  themeHash ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(themeBootstrap))
    .then(
      (bytes) =>
        'sha256-' + btoa(String.fromCharCode(...new Uint8Array(bytes))),
    );
  const hash = await themeHash;
  const copy = new Response(response.body, response);
  copy.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' '${hash}' https://challenges.cloudflare.com https://static.cloudflareinsights.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com; img-src 'self' data: https://i.ytimg.com; connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`,
  );
  copy.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  copy.headers.set('X-Content-Type-Options', 'nosniff');
  if (!copy.headers.has('Referrer-Policy'))
    copy.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  copy.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  if (preview) copy.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return copy;
}
