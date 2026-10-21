import { z } from 'zod';
import type { Env } from '../env';
import type { Order } from '../store-types';
import { orderBySession } from '../stripe/fulfill';
import {
  reply,
  sameOrigin,
  formBody,
  limited,
  validSession,
} from '../security/store';
import { saveKit } from './kit';
import { subscriberStatement } from './d1';
export async function applyOwner(
  order: Order,
  env: Env,
  transport: typeof fetch = fetch,
) {
  const exists = await env.DB.prepare(
    'SELECT applied_at FROM owner_consents WHERE order_id=?',
  )
    .bind(order.id)
    .first<{ applied_at: number | null }>();
  if (!exists || exists.applied_at) return;
  const tag = 'owner-' + order.slug;
  if (env.EMAIL_PROVIDER === 'kit') {
    const map = JSON.parse(env.KIT_OWNER_TAGS || '{}') as Record<
      string,
      string
    >;
    if (!/^\d+$/.test(map[order.slug] || ''))
      throw Error('Owner email setup required.');
    const id = await saveKit(
      {
        email: order.email,
        source: env.PUBLIC_SITE_URL + '/thanks/',
        tags: ['app-updates'],
      },
      env,
      transport,
    );
    const result = await transport(
      `https://api.kit.com/v4/tags/${map[order.slug]}/subscribers/${id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kit-Api-Key': env.KIT_API_KEY!,
        },
        body: '{}',
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!result.ok) throw Error('Owner preference unavailable.');
  } else {
    await env.DB.batch([
      subscriberStatement(
        {
          email: order.email,
          source: env.PUBLIC_SITE_URL + '/thanks/',
          tags: ['app-updates'],
        },
        env,
      ),
      env.DB.prepare(
        'UPDATE subscribers SET tags=(SELECT json_group_array(value) FROM (SELECT value FROM json_each(subscribers.tags) UNION SELECT ?)) WHERE email=?',
      ).bind(tag, order.email),
    ]);
  }
  await env.DB.prepare(
    'UPDATE owner_consents SET applied_at=? WHERE order_id=?',
  )
    .bind(Date.now(), order.id)
    .run();
}
export async function ownerOptIn(request: Request, env: Env) {
  if (request.method !== 'POST')
    return reply({ message: 'Please use your order page.' }, 405, {
      Allow: 'POST',
    });
  if (!sameOrigin(request, env))
    return reply({ message: 'Please use your order page.' }, 403);
  if (!(await limited(request, env, 'owner', 10, 600000)))
    return reply({ message: 'Please try again later.' }, 429);
  let input;
  try {
    input = z
      .object({ session_id: z.string(), app_updates: z.literal(true) })
      .strict()
      .parse(await formBody(request));
  } catch {
    return reply(
      { message: 'Please choose app updates on your order page.' },
      400,
    );
  }
  if (!validSession(input.session_id))
    return reply({ message: 'Please open your confirmed order page.' }, 403);
  const order = await orderBySession(input.session_id, env);
  if (!order || order.status !== 'fulfilled' || !order.fulfilled_at)
    return reply(
      { message: 'Please wait for your order to be confirmed.' },
      403,
    );
  await env.DB.prepare(
    'INSERT INTO owner_consents(order_id,created_at) VALUES (?,?) ON CONFLICT(order_id) DO NOTHING',
  )
    .bind(order.id, Date.now())
    .run();
  try {
    await applyOwner(order, env);
  } catch {
    /* Retried by maintenance; never blocks a download. */
  }
  return reply({
    ok: true,
    message:
      env.LOCAL_DEV === 'true'
        ? 'Preference saved locally. No email was sent.'
        : 'Your app update preference was saved.',
  });
}
