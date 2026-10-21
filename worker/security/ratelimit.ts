import type { Env } from '../env';
export async function allowSignup(
  request: Request,
  env: Env,
  now = Date.now(),
): Promise<boolean> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      'signup:' + (request.headers.get('CF-Connecting-IP') || 'local'),
    ),
  );
  const key = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  if (!(await env.RATE_LIMITER.limit({ key })).success) return false;
  await env.DB.prepare('DELETE FROM signup_rate_events WHERE requested_at <= ?')
    .bind(now - 600_000)
    .run();
  const result = await env.DB.prepare(
    'INSERT INTO signup_rate_events(id,rate_key,requested_at) SELECT ?1,?2,?3 WHERE (SELECT COUNT(*) FROM signup_rate_events WHERE rate_key=?2 AND requested_at>?4) < 5 RETURNING id',
  )
    .bind(crypto.randomUUID(), key, now, now - 600_000)
    .first();
  return result !== null;
}
