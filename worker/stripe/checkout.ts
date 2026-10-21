import { z } from 'zod';
import type { Env } from '../env';
import { stripeClient, type StoreStripe } from './client';
import { productFor, purchasable, priceIds, type PriceIds } from './catalog';
import {
  reply,
  sameOrigin,
  limited,
  formBody,
  privateHeaders,
} from '../security/store';
export async function checkout(
  request: Request,
  env: Env,
  client?: StoreStripe,
  ids: PriceIds = priceIds,
) {
  if (env.STORE_MODE === 'off')
    return reply({ message: 'This app is not available to buy yet.' }, 404);
  if (request.method !== 'POST')
    return reply({ message: 'Please use the Buy button.' }, 405, {
      Allow: 'POST',
    });
  if (env.STORE_MODE !== 'test')
    return reply({ message: 'Test checkout is unavailable.' }, 503);
  if (!sameOrigin(request, env))
    return reply({ message: 'Please open the app page and try again.' }, 403);
  if (!(await limited(request, env, 'checkout', 10, 600000)))
    return reply(
      { message: 'Please wait ten minutes before trying checkout again.' },
      429,
      { 'Retry-After': '600' },
    );
  let input;
  try {
    input = z
      .object({ slug: z.string().regex(/^[a-z0-9-]+$/) })
      .strict()
      .parse(await formBody(request));
  } catch {
    return reply({ message: 'Please choose an app on its product page.' }, 400);
  }
  const product = productFor(input.slug);
  const price = ids[input.slug];
  if (!product || !purchasable(product, env))
    return reply({ message: 'This app is not available to buy yet.' }, 404);
  if (!price?.price_id)
    return reply(
      {
        message:
          'Test checkout setup is not finished yet. Please try again later.',
      },
      503,
    );
  try {
    const stripe = client || stripeClient(env);
    const ref = crypto.randomUUID();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price: price.price_id, quantity: 1 }],
        managed_payments: { enabled: true },
        success_url:
          env.PUBLIC_SITE_URL + '/thanks/?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: env.PUBLIC_SITE_URL + '/apps/' + product.slug + '/',
        client_reference_id: ref,
        metadata: { slug: product.slug, version: product.version, env: 'test' },
        allow_promotion_codes: true,
      },
      { idempotencyKey: ref },
    );
    if (
      session.livemode ||
      !session.url ||
      new URL(session.url).origin !== 'https://checkout.stripe.com'
    )
      throw Error('Invalid checkout.');
    await env.DB.prepare(
      'INSERT INTO checkout_sessions(id,slug,env,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
    )
      .bind(session.id, product.slug, 'test', Date.now())
      .run();
    return new Response(null, {
      status: 303,
      headers: { ...privateHeaders, Location: session.url },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const managed = /managed.?payments/i.test(detail);
    return reply(
      {
        message: managed
          ? 'Test checkout is paused until Managed Payments is activated in Stripe Settings.'
          : 'Test checkout could not start. Please try again shortly.',
        code: managed ? 'managed_payments_setup' : 'checkout_unavailable',
      },
      503,
    );
  }
}
