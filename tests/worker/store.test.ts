import { beforeAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import schema from '../../migrations/0001_init.sql?raw';
import storeSchema from '../../migrations/0002_store.sql?raw';
import { checkout } from '../../worker/stripe/checkout';
import {
  fulfill,
  orderBySession,
  applyHold,
} from '../../worker/stripe/fulfill';
import { webhook, drainEvents } from '../../worker/stripe/webhook';
import { orderStatus } from '../../worker/stripe/status';
import { download } from '../../worker/download/serve';
import { resend, resendMessage } from '../../worker/download/resend';
import { ownerOptIn } from '../../worker/email/owners';
import { activeToken, tokenUrl, hashToken } from '../../worker/download/tokens';
import { flushOrderMail } from '../../worker/mail';
import { stripeClient, type StoreStripe } from '../../worker/stripe/client';
import type { Env } from '../../worker/env';
import type { Order } from '../../worker/store-types';
const slug = 'ornament-bulk-creator';
const sessionId = 'cs_test_fixture_session';
const ids = {
  [slug]: { product_id: 'prod_fixture', price_id: 'price_fixture' },
};
const cfg = () =>
  ({
    ...env,
    STORE_MODE: 'test',
    SHOW_DRAFTS: 'true',
    MAIL_PROVIDER: 'log',
    DOWNLOAD_TOKEN_SECRET: String('fixture-download-key-').repeat(3),
    STRIPE_WEBHOOK_SECRET: String('fixture-signing-value'),
    DOWNLOAD_TTL_HOURS: '72',
    DOWNLOAD_MAX_USES: '5',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
  }) as Env;
const paid = (extra: Record<string, unknown> = {}) =>
  ({
    id: sessionId,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    payment_status: 'paid',
    payment_intent: 'pi_fixture',
    currency: 'usd',
    amount_total: 2499,
    customer_details: { email: 'buyer@example.test' },
    metadata: { slug, version: '1.0.0', env: 'test' },
    line_items: {
      data: [{ quantity: 1, price: { id: 'price_fixture' } }],
      has_more: false,
    },
    ...extra,
  }) as unknown as Stripe.Checkout.Session;
function mocked(session = paid()) {
  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          ...session,
          url: 'https://checkout.stripe.com/c/pay/fixture',
        }),
        retrieve: vi.fn().mockResolvedValue(session),
      },
    },
    charges: {
      retrieve: vi.fn().mockResolvedValue({ payment_intent: 'pi_fixture' }),
    },
    paymentIntents: { retrieve: vi.fn() },
  } as unknown as StoreStripe;
}
const post = (path: string, body: unknown) =>
  new Request('http://localhost:8787' + path, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:8787',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
const seed = () =>
  env.DB.prepare(
    'INSERT INTO checkout_sessions(id,slug,env,created_at) VALUES (?,?,?,?)',
  )
    .bind(sessionId, slug, 'test', Date.now())
    .run();
const count = async (table: string) =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM ' + table).first<{
    n: number;
  }>())!.n;
async function signed(
  type: string,
  object: unknown,
  id = 'evt_fixture',
  config = cfg(),
) {
  const payload = JSON.stringify({
    id,
    object: 'event',
    type,
    livemode: false,
    data: { object },
    created: Math.floor(Date.now() / 1000),
  });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: config.STRIPE_WEBHOOK_SECRET!,
  });
  return new Request('http://localhost:8787/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: payload,
  });
}
beforeAll(async () => {
  await env.DB.exec(schema.replace(/^--.*$/gm, ''));
  await env.DB.exec(storeSchema.replace(/^--.*$/gm, ''));
});
beforeEach(async () => {
  await env.DB.batch(
    [
      'owner_consents',
      'delivery_outbox',
      'mail_jobs',
      'download_tokens',
      'orders',
      'checkout_sessions',
      'webhook_events',
      'payment_holds',
      'store_rate_events',
      'subscribers',
    ].map((table) => env.DB.prepare('DELETE FROM ' + table)),
  );
  await env.DOWNLOADS.put(
    'apps/ornament-bulk-creator/1.0.0/ornament-bulk-creator-1.0.0.zip',
    new Uint8Array([80, 75, 3, 4]),
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    Error('Unexpected network request in offline test.'),
  );
});
afterEach(() => vi.restoreAllMocks());
it('creates only Managed Payments test checkout and returns a 303', async () => {
  const stripe = mocked();
  const response = await checkout(
    post('/api/checkout', { slug }),
    cfg(),
    stripe,
    ids,
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(
    response.headers
      .get('location')
      ?.startsWith('https://checkout.stripe.com/'),
  ).toBe(true);
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'payment',
      line_items: [{ price: 'price_fixture', quantity: 1 }],
      managed_payments: { enabled: true },
      allow_promotion_codes: true,
      success_url:
        'http://localhost:8787/thanks/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:8787/apps/' + slug + '/',
      metadata: { slug, version: '1.0.0', env: 'test' },
    }),
    expect.anything(),
  );
  expect(await count('checkout_sessions')).toBe(1);
});
it('refuses off/live stores, foreign origins, missing prices and draft products outside local preview', async () => {
  const stripe = mocked();
  expect(
    (
      await checkout(
        post('/api/checkout', { slug }),
        { ...cfg(), STORE_MODE: 'off' },
        stripe,
        ids,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await checkout(
        post('/api/checkout', { slug }),
        { ...cfg(), STORE_MODE: 'live' },
        stripe,
        ids,
      )
    ).status,
  ).toBe(503);
  expect(
    (await checkout(post('/api/checkout', { slug }), cfg(), stripe, {})).status,
  ).toBe(503);
  expect(
    (
      await checkout(
        post('/api/checkout', { slug }),
        { ...cfg(), LOCAL_DEV: 'false' },
        stripe,
        ids,
      )
    ).status,
  ).toBe(404);
  const request = post('/api/checkout', { slug });
  request.headers.set('Origin', 'https://foreign.example');
  expect((await checkout(request, cfg(), stripe, ids)).status).toBe(403);
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});
it('refuses non-test API credentials without making a network call', () => {
  expect(() =>
    stripeClient({
      ...cfg(),
      STRIPE_SECRET_KEY: ['sk', 'live', 'fixture'].join('_'),
    }),
  ).toThrow();
  expect(() => stripeClient({ ...cfg(), STORE_MODE: 'live' })).toThrow();
});
it('reports Managed Payments setup without returning the provider error', async () => {
  const stripe = mocked();
  vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(
    Error('managed_payments not enabled: private provider details'),
  );
  const response = await checkout(
    post('/api/checkout', { slug }),
    cfg(),
    stripe,
    ids,
  );
  expect(response.status).toBe(503);
  const result = (await response.json()) as { code: string; message: string };
  expect(result.code).toBe('managed_payments_setup');
  expect(result.message.includes('private provider details')).toBe(false);
});
it('limits checkout to ten attempts per ten minutes', async () => {
  for (let n = 0; n < 10; n++)
    await checkout(
      post('/api/checkout', { slug: 'missing' }),
      cfg(),
      mocked(),
      ids,
    );
  expect(
    (await checkout(post('/api/checkout', { slug }), cfg(), mocked(), ids))
      .status,
  ).toBe(429);
});
it('verifies signatures and rejects missing, wrong and old signatures', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(
    (await webhook(post('/api/stripe/webhook', {}), cfg(), mocked(), ids))
      .status,
  ).toBe(400);
  const wrong = await signed('checkout.session.completed', paid());
  wrong.headers.set('Stripe-Signature', 'wrong');
  expect((await webhook(wrong, cfg(), mocked(), ids)).status).toBe(400);
  const payload = JSON.stringify({ type: 'checkout.session.completed' });
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: cfg().STRIPE_WEBHOOK_SECRET!,
    timestamp: Math.floor(Date.now() / 1000) - 400,
  });
  expect(
    (
      await webhook(
        new Request('http://localhost:8787/api/stripe/webhook', {
          method: 'POST',
          headers: { 'Stripe-Signature': signature },
          body: payload,
        }),
        cfg(),
        mocked(),
        ids,
      )
    ).status,
  ).toBe(400);
  expect(await count('orders')).toBe(0);
});
it('a duplicate signed event creates one order, token and delivery email', async () => {
  await seed();
  const stripe = mocked();
  for (let n = 0; n < 2; n++)
    expect(
      (
        await webhook(
          await signed('checkout.session.completed', paid()),
          cfg(),
          stripe,
          ids,
        )
      ).status,
    ).toBe(200);
  for (const table of [
    'orders',
    'download_tokens',
    'mail_jobs',
    'delivery_outbox',
    'webhook_events',
  ])
    expect(await count(table)).toBe(1);
  expect((await orderBySession(sessionId, cfg()))?.status).toBe('fulfilled');
});
it('a webhook and thank-you poll racing each other fulfill exactly once', async () => {
  await seed();
  const config = cfg();
  const stripe = mocked();
  await Promise.all([
    webhook(
      await signed('checkout.session.completed', paid()),
      config,
      stripe,
      ids,
    ),
    orderStatus(
      new Request(
        'http://localhost:8787/api/order-status?session_id=' + sessionId,
      ),
      config,
      stripe,
      ids,
    ),
  ]);
  for (const table of [
    'orders',
    'download_tokens',
    'mail_jobs',
    'delivery_outbox',
  ])
    expect(await count(table)).toBe(1);
});
it('only fulfills a known price and a paid, matching test session', async () => {
  await seed();
  await expect(
    fulfill(sessionId, cfg(), mocked(paid({ livemode: true })), ids),
  ).rejects.toThrow();
  await expect(
    fulfill(
      sessionId,
      cfg(),
      mocked(
        paid({
          line_items: { data: [{ quantity: 1, price: { id: 'wrong' } }] },
        }),
      ),
      ids,
    ),
  ).rejects.toThrow();
  expect(await count('download_tokens')).toBe(0);
  const pending = await fulfill(
    sessionId,
    cfg(),
    mocked(paid({ payment_status: 'unpaid' })),
    ids,
  );
  expect(pending?.status).toBe('pending');
  expect(await count('delivery_outbox')).toBe(0);
});
it('an async success fulfills a pending payment; a late failure cannot undo fulfillment', async () => {
  await seed();
  await webhook(
    await signed('checkout.session.completed', paid(), 'evt_pending'),
    cfg(),
    mocked(paid({ payment_status: 'unpaid' })),
    ids,
  );
  expect((await orderBySession(sessionId, cfg()))?.status).toBe('pending');
  await webhook(
    await signed(
      'checkout.session.async_payment_succeeded',
      paid(),
      'evt_paid',
    ),
    cfg(),
    mocked(),
    ids,
  );
  await webhook(
    await signed(
      'checkout.session.async_payment_failed',
      paid(),
      'evt_late_failure',
    ),
    cfg(),
    mocked(),
    ids,
  );
  expect((await orderBySession(sessionId, cfg()))?.status).toBe('fulfilled');
  expect(await count('delivery_outbox')).toBe(1);
});
it('records asynchronous payment failures without granting downloads', async () => {
  await seed();
  await webhook(
    await signed('checkout.session.async_payment_failed', paid()),
    cfg(),
    mocked(paid({ payment_status: 'unpaid' })),
    ids,
  );
  expect((await orderBySession(sessionId, cfg()))?.status).toBe('failed');
  expect(await count('download_tokens')).toBe(0);
});
it('persists verified events and recovers after a temporary Stripe failure', async () => {
  await seed();
  const stripe = mocked();
  vi.mocked(stripe.checkout.sessions.retrieve).mockRejectedValueOnce(
    Error('Offline fixture'),
  );
  expect(
    (
      await webhook(
        await signed('checkout.session.completed', paid()),
        cfg(),
        stripe,
        ids,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await env.DB.prepare('SELECT processed_at FROM webhook_events').first<{
        processed_at: number | null;
      }>()
    )?.processed_at,
  ).toBeNull();
  await drainEvents(cfg(), stripe, ids);
  expect(await count('orders')).toBe(1);
  expect(await count('delivery_outbox')).toBe(1);
});
it('email failure never undoes fulfillment and the next poll retries once', async () => {
  await seed();
  const config = { ...cfg(), MAIL_PROVIDER: 'resend' as const };
  await fulfill(sessionId, config, mocked(), ids);
  const order = (await orderBySession(sessionId, config))!;
  expect(order.status).toBe('fulfilled');
  expect(order.email_sent_at).toBeNull();
  const response = await orderStatus(
    new Request(
      'http://localhost:8787/api/order-status?session_id=' + sessionId,
    ),
    cfg(),
    mocked(),
    ids,
  );
  expect(response.status).toBe(200);
  expect(await count('delivery_outbox')).toBe(1);
  await flushOrderMail(order.id, cfg());
  expect(await count('delivery_outbox')).toBe(1);
});
it('stores a hash rather than a bearer token and enforces five concurrent uses', async () => {
  await seed();
  const config = cfg();
  const order = (await fulfill(sessionId, config, mocked(), ids))!;
  const token = (await activeToken(order.id, config))!;
  const url = await tokenUrl(token, config);
  const raw = new URL(url).pathname.split('/').pop()!;
  expect(raw === token.token_hash || raw === token.seed).toBe(false);
  expect((await hashToken(raw)) === token.token_hash).toBe(true);
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => download(new Request(url), config)),
  );
  expect(responses.filter((x) => x.status === 200)).toHaveLength(5);
  expect(responses.filter((x) => x.status === 410)).toHaveLength(1);
  const ok = responses.find((x) => x.status === 200)!;
  expect(ok.headers.get('Content-Type')).toBe('application/zip');
  expect(ok.headers.get('Content-Disposition')).toContain('attachment;');
  expect(ok.headers.get('Cache-Control')).toBe('no-store');
});
it.each(['expired', 'revoked'] as const)(
  'refuses a %s token',
  async (state) => {
    await seed();
    const order = (await fulfill(sessionId, cfg(), mocked(), ids))!;
    const token = (await activeToken(order.id, cfg()))!;
    const url = await tokenUrl(token, cfg());
    await env.DB.prepare(
      state === 'expired'
        ? 'UPDATE download_tokens SET expires_at=0'
        : 'UPDATE download_tokens SET revoked=1',
    ).run();
    expect((await download(new Request(url), cfg())).status).toBe(410);
  },
);
it('renews an exhausted browser token only while the order is under thirty days old', async () => {
  await seed();
  await fulfill(sessionId, cfg(), mocked(), ids);
  await env.DB.prepare('UPDATE download_tokens SET uses=max_uses').run();
  const req = () =>
    new Request(
      'http://localhost:8787/api/order-status?session_id=' + sessionId,
    );
  const result = (await (
    await orderStatus(req(), cfg(), mocked(), ids)
  ).json()) as { state: string };
  expect(result.state).toBe('ready');
  expect(await count('download_tokens')).toBe(2);
  await env.DB.prepare('UPDATE download_tokens SET uses=max_uses').run();
  await env.DB.prepare('UPDATE orders SET created_at=?')
    .bind(Date.now() - 31 * 86400000)
    .run();
  expect(
    (
      (await (await orderStatus(req(), cfg(), mocked(), ids)).json()) as {
        state: string;
      }
    ).state,
  ).toBe('not_paid');
  expect(await count('download_tokens')).toBe(2);
});
it.each(['charge.refunded', 'charge.dispute.created'])(
  '%s revokes downloads and stops reissue',
  async (type) => {
    await seed();
    const order = (await fulfill(sessionId, cfg(), mocked(), ids))!;
    const token = (await activeToken(order.id, cfg()))!;
    const url = await tokenUrl(token, cfg());
    await webhook(
      await signed(type, { id: 'ch_fixture', payment_intent: 'pi_fixture' }),
      cfg(),
      mocked(),
      ids,
    );
    expect((await download(new Request(url), cfg())).status).toBe(410);
    const result = (await (
      await orderStatus(
        new Request(
          'http://localhost:8787/api/order-status?session_id=' + sessionId,
        ),
        cfg(),
        mocked(),
        ids,
      )
    ).json()) as { state: string };
    expect(result.state).toBe('not_paid');
    const response = await resend(
      post('/api/resend-download', {
        email: 'buyer@example.test',
        'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
      }),
      cfg(),
    );
    expect(response.status).toBe(200);
    expect(await count('download_tokens')).toBe(1);
  },
);
it('a refund arriving before fulfillment prevents later delivery', async () => {
  await applyHold('pi_fixture', 'refunded', cfg());
  await seed();
  const order = await fulfill(sessionId, cfg(), mocked(), ids);
  expect(order?.status).toBe('refunded');
  expect(await count('download_tokens')).toBe(0);
});
it('resend answers identically for known and unknown buyers and is limited to three per hour', async () => {
  await seed();
  await fulfill(sessionId, cfg(), mocked(), ids);
  const send = (email: string) =>
    resend(
      post('/api/resend-download', {
        email,
        'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
      }),
      cfg(),
    );
  const known = await send('buyer@example.test');
  const unknown = await send('unknown@example.test');
  expect(await known.json()).toEqual(await unknown.json());
  expect(await count('download_tokens')).toBe(2);
  expect(await count('delivery_outbox')).toBe(2);
  expect((await send('unknown@example.test')).status).toBe(200);
  expect((await send('unknown@example.test')).status).toBe(429);
});
it('resend refuses invalid bot checks and never sends for orders over a year old', async () => {
  expect(
    (
      await resend(
        post('/api/resend-download', {
          email: 'buyer@example.test',
          'cf-turnstile-response': 'wrong',
        }),
        cfg(),
      )
    ).status,
  ).toBe(400);
  await seed();
  await fulfill(sessionId, cfg(), mocked(), ids);
  await env.DB.prepare('UPDATE orders SET created_at=0').run();
  const response = await resend(
    post('/api/resend-download', {
      email: 'buyer@example.test',
      'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
    }),
    cfg(),
  );
  expect(((await response.json()) as { message: string }).message).toBe(
    resendMessage,
  );
  expect(await count('download_tokens')).toBe(1);
});
it('owner tags require a fulfilled order and explicit consent, never a client slug', async () => {
  const req = (extra: Record<string, unknown> = {}) =>
    post('/api/order-updates', {
      session_id: sessionId,
      app_updates: true,
      ...extra,
    });
  expect((await ownerOptIn(req(), cfg())).status).toBe(403);
  await seed();
  await fulfill(sessionId, cfg(), mocked(), ids);
  expect((await ownerOptIn(req({ owner_slug: slug }), cfg())).status).toBe(400);
  expect((await ownerOptIn(req({ app_updates: false }), cfg())).status).toBe(
    400,
  );
  expect((await ownerOptIn(req(), cfg())).status).toBe(200);
  const tags = JSON.parse(
    (await env.DB.prepare('SELECT tags FROM subscribers').first<{
      tags: string;
    }>())!.tags,
  );
  expect(tags.sort()).toEqual(['app-updates', 'owner-' + slug].sort());
  const order = (await orderBySession(sessionId, cfg())) as Order;
  expect(order.email_sent_at !== null).toBe(true);
});
