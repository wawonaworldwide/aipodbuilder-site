import Stripe from 'stripe';
import type { Env } from '../env';
import { stripeClient, type StoreStripe } from './client';
import { fulfill, applyHold, objectId } from './fulfill';
import type { PriceIds } from './catalog';
import { reply, boundedText } from '../security/store';
export async function processEvent(
  event: Stripe.Event,
  env: Env,
  client?: StoreStripe,
  ids?: PriceIds,
) {
  if (event.livemode) throw Error('Test events only.');
  const object = event.data.object;
  if (
    [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
    ].includes(event.type)
  ) {
    const session = object as Stripe.Checkout.Session;
    await fulfill(session.id, env, client, ids);
    if (event.type === 'checkout.session.async_payment_failed')
      await env.DB.prepare(
        "UPDATE orders SET status='failed' WHERE stripe_session_id=? AND fulfilled_at IS NULL AND status='pending'",
      )
        .bind(session.id)
        .run();
  } else if (event.type === 'charge.refunded') {
    const charge = object as Stripe.Charge;
    const pi = objectId(charge.payment_intent);
    if (pi) await applyHold(pi, 'refunded', env);
  } else if (event.type === 'charge.dispute.created') {
    const dispute = object as Stripe.Dispute;
    let pi = objectId(dispute.payment_intent);
    if (!pi) {
      const charge = await (client || stripeClient(env)).charges.retrieve(
        objectId(dispute.charge)!,
      );
      pi = objectId(charge.payment_intent);
    }
    if (pi) await applyHold(pi, 'disputed', env);
  }
}
export async function drainEvents(
  env: Env,
  client?: StoreStripe,
  ids?: PriceIds,
) {
  const now = Date.now();
  const rows = await env.DB.prepare(
    'SELECT event_id FROM webhook_events WHERE processed_at IS NULL AND lease_until<=? ORDER BY received_at LIMIT 10',
  )
    .bind(now)
    .all<{ event_id: string }>();
  for (const { event_id } of rows.results) {
    const row = await env.DB.prepare(
      'UPDATE webhook_events SET lease_until=? WHERE event_id=? AND processed_at IS NULL AND lease_until<=? RETURNING payload',
    )
      .bind(now + 30000, event_id, now)
      .first<{ payload: string }>();
    if (!row) continue;
    try {
      await processEvent(JSON.parse(row.payload), env, client, ids);
      await env.DB.prepare(
        'UPDATE webhook_events SET processed_at=?,payload=?,lease_until=0 WHERE event_id=?',
      )
        .bind(Date.now(), '{}', event_id)
        .run();
    } catch {
      await env.DB.prepare(
        'UPDATE webhook_events SET lease_until=0 WHERE event_id=?',
      )
        .bind(event_id)
        .run();
    }
  }
}
export async function webhook(
  request: Request,
  env: Env,
  client?: StoreStripe,
  ids?: PriceIds,
  context?: { waitUntil(task: Promise<unknown>): void },
) {
  if (request.method !== 'POST')
    return reply({ message: 'Use a Stripe notification.' }, 405, {
      Allow: 'POST',
    });
  if (env.STORE_MODE !== 'test' || !env.STRIPE_WEBHOOK_SECRET)
    return reply({ message: 'Test webhook setup required.' }, 503);
  let event: Stripe.Event;
  try {
    const raw = await boundedText(request, 262144);
    const signature = request.headers.get('Stripe-Signature');
    if (!signature) throw Error('Missing signature.');
    // Verification needs no API request or API key.
    const verifier = new Stripe('unused-for-signatures', {
      httpClient: Stripe.createFetchHttpClient(),
    });
    event = await verifier.webhooks.constructEventAsync(
      raw,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      300,
      Stripe.createSubtleCryptoProvider(),
    );
    if (event.livemode) throw Error('Wrong mode.');
  } catch {
    console.warn('invalid signature');
    return reply({ message: 'Notification could not be verified.' }, 400);
  }
  await env.DB.prepare(
    'INSERT INTO webhook_events(event_id,type,payload,received_at) VALUES (?,?,?,?) ON CONFLICT(event_id) DO NOTHING',
  )
    .bind(event.id, event.type, JSON.stringify(event), Date.now())
    .run();
  if (context) context.waitUntil(drainEvents(env, client, ids).catch(() => {}));
  else await drainEvents(env, client, ids);
  return reply({ received: true });
}
