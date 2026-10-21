import type { Env } from '../env';
import { localRequest } from './turnstile';
export const privateHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};
export const reply = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, { status, headers: { ...privateHeaders, ...headers } });
export function sameOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  return (
    origin === new URL(env.PUBLIC_SITE_URL).origin ||
    (localRequest(request, env) &&
      ['http://localhost:4321', 'http://localhost:8787'].includes(origin || ''))
  );
}
export async function limited(
  request: Request,
  env: Env,
  scope: string,
  max: number,
  windowMs: number,
  now = Date.now(),
) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      scope + ':' + (request.headers.get('CF-Connecting-IP') || 'local'),
    ),
  );
  const key = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  await env.DB.prepare('DELETE FROM store_rate_events WHERE requested_at <= ?')
    .bind(now - 3600000)
    .run();
  const row = await env.DB.prepare(
    'INSERT INTO store_rate_events(id,rate_key,requested_at) SELECT ?1,?2,?3 WHERE (SELECT COUNT(*) FROM store_rate_events WHERE rate_key=?2 AND requested_at>?4) < ?5 RETURNING id',
  )
    .bind(crypto.randomUUID(), key, now, now - windowMs, max)
    .first();
  return row !== null;
}
export async function boundedText(request: Request, max = 8192) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw Error('Request too large.');
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(data);
}
export async function formBody(request: Request) {
  const text = await boundedText(request);
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) return JSON.parse(text);
  if (!type.includes('application/x-www-form-urlencoded'))
    throw Error('Unsupported form.');
  const data: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (key in data) throw Error('Duplicate form field.');
    data[key] = value;
  }
  return data;
}
export const validSession = (value: string) =>
  /^cs_test_[A-Za-z0-9_]{6,200}$/.test(value);
