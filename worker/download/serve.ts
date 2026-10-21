import type { Env } from '../env';
import { hashToken } from './tokens';
import { privateHeaders } from '../security/store';
export function expired() {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Request a fresh download | AI POD Builder</title><body><main><h1>Let’s get you a fresh download.</h1><p>This link is expired or has reached its download limit.</p><p><a href="/download/expired/">Request a fresh link with your purchase email</a></p></main></body></html>',
    {
      status: 410,
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  );
}
export async function download(request: Request, env: Env) {
  if (request.method !== 'GET')
    return new Response('Please use the download button.', {
      status: 405,
      headers: { ...privateHeaders, Allow: 'GET' },
    });
  const value = new URL(request.url).pathname.slice('/download/'.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return expired();
  const hash = await hashToken(value);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT o.r2_key,o.slug,o.version FROM download_tokens t JOIN orders o ON o.id=t.order_id WHERE t.token_hash=? AND t.revoked=0 AND t.expires_at>? AND t.uses<t.max_uses AND o.status='fulfilled'",
  )
    .bind(hash, now)
    .first<{ r2_key: string; slug: string; version: string }>();
  if (!row) return expired();
  const object = await env.DOWNLOADS.get(row.r2_key);
  if (!object)
    return new Response(
      'The file is taking a break. Please try again shortly.',
      { status: 503, headers: privateHeaders },
    );
  const claim = await env.DB.prepare(
    "UPDATE download_tokens SET uses=uses+1 WHERE token_hash=? AND revoked=0 AND expires_at>? AND uses<max_uses AND EXISTS(SELECT 1 FROM orders WHERE id=order_id AND status='fulfilled') RETURNING uses",
  )
    .bind(hash, now)
    .first();
  if (!claim) {
    await object.body.cancel();
    return expired();
  }
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      ...privateHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${row.slug}-${row.version}.zip"`,
      'Content-Length': String(object.size),
    },
  });
}
