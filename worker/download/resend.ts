import { z } from 'zod';
import type { Env } from '../env';
import type { Order } from '../store-types';
import { reply, sameOrigin, limited, formBody } from '../security/store';
import { verifyTurnstile } from '../security/turnstile';
import { newToken, insertToken } from './tokens';
import { flushOrderMail } from '../mail';
export const resendMessage =
  'If that email bought something, a fresh link is on its way.';
export async function resend(request: Request, env: Env) {
  if (request.method !== 'POST')
    return reply({ message: 'Please use the recovery form.' }, 405, {
      Allow: 'POST',
    });
  if (!sameOrigin(request, env))
    return reply(
      { message: 'Please open the recovery form on this site.' },
      403,
    );
  if (!(await limited(request, env, 'resend', 3, 3600000)))
    return reply(
      { message: 'Please wait an hour before requesting another link.' },
      429,
      { 'Retry-After': '3600' },
    );
  let input;
  try {
    input = z
      .object({
        email: z.string().trim().toLowerCase().pipe(z.email()),
        company: z.string().optional(),
        'cf-turnstile-response': z.string(),
      })
      .strict()
      .parse(await formBody(request));
  } catch {
    return reply({ message: 'That email looks off. Mind checking it?' }, 400);
  }
  if (input.company) return reply({ ok: true, message: resendMessage });
  if (!(await verifyTurnstile(input['cf-turnstile-response'], request, env)))
    return reply(
      { message: 'Please finish the bot check and try again.' },
      400,
    );
  const now = Date.now();
  const orders = await env.DB.prepare(
    "SELECT * FROM orders WHERE email=? AND status='fulfilled' AND fulfilled_at IS NOT NULL AND created_at>? ORDER BY created_at DESC LIMIT 10",
  )
    .bind(input.email, now - 365 * 86400000)
    .all<Order>();
  for (const order of orders.results) {
    try {
      const token = await newToken(order.id, env, now);
      await env.DB.batch([
        insertToken(
          token,
          env,
          "EXISTS(SELECT 1 FROM orders WHERE id=? AND status='fulfilled')",
          [order.id],
        ),
        env.DB.prepare(
          'INSERT INTO mail_jobs(id,order_id,token_hash,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM download_tokens WHERE token_hash=?)',
        ).bind(
          'resend-' + crypto.randomUUID(),
          order.id,
          token.token_hash,
          now,
          token.token_hash,
        ),
      ]);
      await flushOrderMail(order.id, env);
    } catch {
      /* Identical answer for existing and unknown addresses. */
    }
  }
  return reply({ ok: true, message: resendMessage });
}
