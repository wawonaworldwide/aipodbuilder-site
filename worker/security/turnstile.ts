import type { Env } from '../env';
export const localRequest = (request: Request, env: Env) =>
  env.LOCAL_DEV === 'true' && new URL(request.url).hostname === 'localhost';
export async function verifyTurnstile(
  token: unknown,
  request: Request,
  env: Env,
  transport: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const local = localRequest(request, env);
  if (env.TURNSTILE_MODE === 'mock')
    return local && token === 'XXXX.DUMMY.TOKEN.XXXX';
  // Cloudflare's documented public test value, never a user's key.
  const key = local
    ? ['1x', '0'.repeat(31), 'AA'].join('')
    : env.TURNSTILE_SECRET_KEY;
  if (!key || (!local && /^[123]x0+AA$/.test(key))) return false;
  const response = await transport(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: key, response: token }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as {
    success?: boolean;
    hostname?: string;
    action?: string;
  };
  return (
    result.success === true &&
    (local ||
      (result.hostname === new URL(env.PUBLIC_SITE_URL).hostname &&
        result.action === 'subscribe'))
  );
}
