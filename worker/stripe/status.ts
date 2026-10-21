import type { Env } from '../env';
import { fulfill } from './fulfill';
import { drainEvents } from './webhook';
import type { StoreStripe } from './client';
import type { PriceIds } from './catalog';
import { browserToken, tokenUrl } from '../download/tokens';
import { reply, validSession, limited } from '../security/store';
export async function orderStatus(
  request: Request,
  env: Env,
  client?: StoreStripe,
  ids?: PriceIds,
) {
  if (request.method !== 'GET')
    return reply({ state: 'not_paid' }, 405, { Allow: 'GET' });
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!validSession(id)) return reply({ state: 'not_paid' });
  if (!(await limited(request, env, 'order-status', 120, 600000)))
    return reply(
      { state: 'confirming', message: 'Please wait a moment, then reload.' },
      429,
    );
  try {
    await drainEvents(env, client, ids);
    const order = await fulfill(id, env, client, ids);
    if (!order) return reply({ state: 'not_paid' });
    if (['refunded', 'failed', 'disputed'].includes(order.status))
      return reply({
        state: 'not_paid',
        message:
          'This order is not available to download. Please contact support.',
      });
    if (!order.fulfilled_at)
      return reply({ state: 'processing', product: order.product_name });
    const token = await browserToken(order.id, env);
    if (!token)
      return reply({
        state: 'not_paid',
        message: 'Please request a fresh link using your purchase email.',
      });
    const [name, domain] = order.email.split('@');
    return reply({
      state: 'ready',
      product: order.product_name,
      maskedEmail: name.slice(0, 1) + '***@' + domain,
      downloadUrl: await tokenUrl(token, env),
      emailSent: !!(
        await env.DB.prepare('SELECT email_sent_at FROM orders WHERE id=?')
          .bind(order.id)
          .first<{ email_sent_at: number | null }>()
      )?.email_sent_at,
    });
  } catch {
    return reply(
      {
        state: 'confirming',
        message: 'We are checking your payment. Please try again shortly.',
      },
      503,
    );
  }
}
