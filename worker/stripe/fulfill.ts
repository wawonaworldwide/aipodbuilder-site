import type Stripe from 'stripe';
import type { Env } from '../env';
import type { Order } from '../store-types';
import { productFor, priceIds, type PriceIds } from './catalog';
import { stripeClient, type StoreStripe } from './client';
import { newToken, insertToken } from '../download/tokens';
import { flushOrderMail } from '../mail';
export const orderBySession = (sessionId: string, env: Env) =>
  env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id=?')
    .bind(sessionId)
    .first<Order>();
export async function fulfill(
  sessionId: string,
  env: Env,
  client?: StoreStripe,
  ids: PriceIds = priceIds,
): Promise<Order | null> {
  if (env.STORE_MODE !== 'test') throw Error('Test store only.');
  const prior = await orderBySession(sessionId, env);
  if (
    prior?.fulfilled_at ||
    prior?.status === 'refunded' ||
    prior?.status === 'disputed'
  ) {
    await flushOrderMail(prior.id, env);
    return prior;
  }
  const checkout = await env.DB.prepare(
    "SELECT slug FROM checkout_sessions WHERE id=? AND env='test'",
  )
    .bind(sessionId)
    .first<{ slug: string }>();
  if (!checkout) return null;
  const session = await (
    client || stripeClient(env)
  ).checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
  const product = productFor(checkout.slug);
  const item = session.line_items?.data;
  const email = (
    session.customer_details?.email ||
    session.customer_email ||
    ''
  )
    .trim()
    .toLowerCase();
  if (
    !product ||
    !ids[product.slug]?.price_id ||
    session.id !== sessionId ||
    session.livemode ||
    session.mode !== 'payment' ||
    session.metadata?.env !== 'test' ||
    session.metadata?.slug !== product.slug ||
    session.metadata?.version !== product.version ||
    item?.length !== 1 ||
    session.line_items?.has_more ||
    item[0].price?.id !== ids[product.slug]?.price_id ||
    item[0].quantity !== 1 ||
    session.currency !== 'usd' ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total! < 0
  )
    throw Error('Payment validation failed.');
  const pi =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!pi) throw Error('Payment reference missing.');
  const hold = await env.DB.prepare(
    'SELECT status FROM payment_holds WHERE payment_intent=?',
  )
    .bind(pi)
    .first<{ status: string }>();
  const paid = session.payment_status === 'paid';
  const now = Date.now();
  const id = prior?.id || crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO orders(id,stripe_session_id,stripe_payment_intent,slug,product_name,version,r2_key,email,amount_total,currency,status,paid_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(stripe_session_id) DO UPDATE SET status=CASE WHEN orders.status IN ('refunded','disputed','fulfilled') THEN orders.status ELSE excluded.status END,paid_at=COALESCE(orders.paid_at,excluded.paid_at)",
  )
    .bind(
      id,
      sessionId,
      pi,
      product.slug,
      product.name,
      product.version,
      product.r2_key,
      email,
      session.amount_total,
      'usd',
      hold?.status || (paid ? 'paid' : 'pending'),
      paid ? now : null,
      now,
    )
    .run();
  const order = (await orderBySession(sessionId, env))!;
  if (!paid || ['refunded', 'disputed'].includes(order.status)) return order;
  const token = await newToken(order.id, env, now);
  await env.DB.batch([
    insertToken(
      token,
      env,
      "EXISTS (SELECT 1 FROM orders WHERE id=? AND fulfilled_at IS NULL AND status='paid') AND NOT EXISTS (SELECT 1 FROM payment_holds WHERE payment_intent=?)",
      [order.id, pi],
    ),
    env.DB.prepare(
      'INSERT INTO mail_jobs(id,order_id,token_hash,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM download_tokens WHERE token_hash=?) ON CONFLICT(id) DO NOTHING',
    ).bind(
      'delivery-' + order.id,
      order.id,
      token.token_hash,
      now,
      token.token_hash,
    ),
    env.DB.prepare(
      "UPDATE orders SET fulfilled_at=?,status='fulfilled' WHERE id=? AND fulfilled_at IS NULL AND status='paid' AND EXISTS(SELECT 1 FROM download_tokens WHERE token_hash=?)",
    ).bind(now, order.id, token.token_hash),
  ]);
  await flushOrderMail(order.id, env);
  return orderBySession(sessionId, env);
}
export function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id;
}
export async function applyHold(
  paymentIntent: string,
  status: 'refunded' | 'disputed',
  env: Env,
) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO payment_holds(payment_intent,status,created_at) VALUES (?,?,?) ON CONFLICT(payment_intent) DO UPDATE SET status=CASE WHEN payment_holds.status='refunded' THEN 'refunded' ELSE excluded.status END",
    ).bind(paymentIntent, status, Date.now()),
    env.DB.prepare(
      'UPDATE orders SET status=(SELECT status FROM payment_holds WHERE payment_intent=?) WHERE stripe_payment_intent=?',
    ).bind(paymentIntent, paymentIntent),
    env.DB.prepare(
      'UPDATE download_tokens SET revoked=1 WHERE order_id IN (SELECT id FROM orders WHERE stripe_payment_intent=?)',
    ).bind(paymentIntent),
  ]);
}
export type CheckoutSession = Stripe.Checkout.Session;
