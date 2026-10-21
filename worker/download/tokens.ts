import type { Env } from '../env';
import type { TokenRow } from '../store-types';
export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export async function hashToken(token: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
  );
}
// A random 256-bit seed plus a server HMAC lets retries recover the same capability.
// The seed is not a bearer credential. The database keeps only the token's hash.
export async function tokenValue(seed: string, orderId: string, env: Env) {
  if (!env.DOWNLOAD_TOKEN_SECRET || env.DOWNLOAD_TOKEN_SECRET.length < 32)
    throw Error('Delivery setup required.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.DOWNLOAD_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode('download:' + orderId + ':' + seed),
      ),
    ),
  );
}
export async function newToken(
  orderId: string,
  env: Env,
  now = Date.now(),
): Promise<TokenRow> {
  const seed = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const hours = Number(env.DOWNLOAD_TTL_HOURS || 72);
  const max = Number(env.DOWNLOAD_MAX_USES || 5);
  if (
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > 720 ||
    !Number.isInteger(max) ||
    max < 1 ||
    max > 100
  )
    throw Error('Delivery limits unavailable.');
  return {
    token_hash: await hashToken(await tokenValue(seed, orderId, env)),
    seed,
    order_id: orderId,
    expires_at: now + hours * 3600000,
    max_uses: max,
    uses: 0,
    revoked: 0,
    created_at: now,
  };
}
export function insertToken(
  token: TokenRow,
  env: Env,
  condition: string,
  values: (string | number)[] = [],
) {
  return env.DB.prepare(
    `INSERT INTO download_tokens(token_hash,seed,order_id,expires_at,max_uses,created_at) SELECT ?,?,?,?,?,? WHERE ${condition}`,
  ).bind(
    token.token_hash,
    token.seed,
    token.order_id,
    token.expires_at,
    token.max_uses,
    token.created_at,
    ...values,
  );
}
export async function activeToken(orderId: string, env: Env, now = Date.now()) {
  return env.DB.prepare(
    'SELECT * FROM download_tokens WHERE order_id=? AND revoked=0 AND expires_at>? AND uses<max_uses ORDER BY created_at DESC,token_hash LIMIT 1',
  )
    .bind(orderId, now)
    .first<TokenRow>();
}
export async function browserToken(
  orderId: string,
  env: Env,
  now = Date.now(),
) {
  let token = await activeToken(orderId, env, now);
  if (token) return token;
  const candidate = await newToken(orderId, env, now);
  await insertToken(
    candidate,
    env,
    "EXISTS (SELECT 1 FROM orders WHERE id=? AND status='fulfilled' AND created_at>?) AND NOT EXISTS (SELECT 1 FROM download_tokens WHERE order_id=? AND revoked=0 AND expires_at>? AND uses<max_uses)",
    [orderId, now - 30 * 86400000, orderId, now],
  ).run();
  token = await activeToken(orderId, env, now);
  return token;
}
export const tokenUrl = async (token: TokenRow, env: Env) =>
  env.PUBLIC_SITE_URL +
  '/download/' +
  (await tokenValue(token.seed, token.order_id, env));
