import type { Env } from '../env';
import type { Order, TokenRow } from '../store-types';
import { tokenUrl } from '../download/tokens';
export type DeliveryMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export async function deliveryMessage(
  order: Order,
  token: TokenRow,
  env: Env,
): Promise<DeliveryMail> {
  const link = await tokenUrl(token, env);
  const support = env.SUPPORT_EMAIL || 'hello@aipodbuilder.com';
  const text = `Your ${order.product_name} download\n\n${link}\n\nWorks for ${env.DOWNLOAD_TTL_HOURS || 72} hours, up to ${token.max_uses} downloads.\nNeed a fresh link? ${env.PUBLIC_SITE_URL}/download/expired/\n\nUse it, change it, sell what you make with it; don't resell the app.\nQuestions: ${support}\n\nKeep building your AI POD future.`;
  return {
    to: order.email,
    subject: `Your ${order.product_name} download`,
    text,
    html: `<p>Your ${escape(order.product_name)} is ready.</p><p><a href="${escape(link)}">Download your app</a></p><p>Works for ${env.DOWNLOAD_TTL_HOURS || 72} hours, up to ${token.max_uses} downloads.</p><p><a href="${escape(env.PUBLIC_SITE_URL)}/download/expired/">Request a fresh link</a></p><p>Use it, change it, sell what you make with it; don't resell the app.</p><p>Questions: ${escape(support)}</p><p>Keep building your AI POD future.</p>`,
  };
}
export async function sendDelivery(
  id: string,
  message: DeliveryMail,
  env: Env,
  transport: typeof fetch = fetch,
) {
  if (env.MAIL_PROVIDER === 'log' && env.LOCAL_DEV === 'true') {
    await env.DB.prepare(
      'INSERT INTO delivery_outbox(id,payload,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING',
    )
      .bind(id, JSON.stringify(message), Date.now())
      .run();
    return;
  }
  if (env.MAIL_PROVIDER !== 'resend' || !env.RESEND_API_KEY || !env.MAIL_FROM)
    throw Error('Email setup required.');
  const result = await transport('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': id,
    },
    body: JSON.stringify({ from: env.MAIL_FROM, ...message }),
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw Error('Email unavailable.');
}
export async function flushOrderMail(
  orderId: string,
  env: Env,
  send = sendDelivery,
) {
  const now = Date.now();
  const job = await env.DB.prepare(
    "UPDATE mail_jobs SET lease_until=? WHERE id=(SELECT j.id FROM mail_jobs j JOIN orders o ON o.id=j.order_id WHERE j.order_id=? AND j.sent_at IS NULL AND j.lease_until<=? AND o.status='fulfilled' ORDER BY j.created_at LIMIT 1) AND sent_at IS NULL AND lease_until<=? RETURNING *",
  )
    .bind(now + 30000, orderId, now, now)
    .first<{ id: string; token_hash: string }>();
  if (!job) return;
  try {
    const order = await env.DB.prepare(
      "SELECT * FROM orders WHERE id=? AND status='fulfilled'",
    )
      .bind(orderId)
      .first<Order>();
    const token = await env.DB.prepare(
      'SELECT * FROM download_tokens WHERE token_hash=? AND revoked=0',
    )
      .bind(job.token_hash)
      .first<TokenRow>();
    if (!order || !token) throw Error('Delivery unavailable.');
    await send(job.id, await deliveryMessage(order, token, env), env);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE mail_jobs SET sent_at=?,lease_until=0 WHERE id=?',
      ).bind(now, job.id),
      env.DB.prepare(
        'UPDATE orders SET email_sent_at=COALESCE(email_sent_at,?) WHERE id=?',
      ).bind(now, orderId),
    ]);
  } catch {
    await env.DB.prepare('UPDATE mail_jobs SET lease_until=0 WHERE id=?')
      .bind(job.id)
      .run();
  }
}
