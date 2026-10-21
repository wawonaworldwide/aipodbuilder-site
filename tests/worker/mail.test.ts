import { it, expect, vi } from 'vitest';
import { deliveryMessage, sendDelivery } from '../../worker/mail';
import { newToken } from '../../worker/download/tokens';
import type { Env } from '../../worker/env';
import type { Order } from '../../worker/store-types';
it('formats the delivery email and uses an idempotency key on mocked Resend', async () => {
  const env = {
    PUBLIC_SITE_URL: 'http://localhost:8787',
    DOWNLOAD_TOKEN_SECRET: String('fixture-download-key-').repeat(3),
    DOWNLOAD_TTL_HOURS: '72',
    DOWNLOAD_MAX_USES: '5',
    MAIL_PROVIDER: 'resend',
    MAIL_FROM: 'fixture@example.test',
    RESEND_API_KEY: String('fixture-only'),
  } as Env;
  const order = {
    id: 'order-fixture',
    product_name: 'Fixture App',
    email: 'buyer@example.test',
  } as Order;
  const token = await newToken(order.id, env);
  const mail = await deliveryMessage(order, token, env);
  expect(mail.subject).toBe('Your Fixture App download');
  expect(mail.text.includes('72 hours, up to 5 downloads')).toBe(true);
  expect(mail.html.includes('Download your app')).toBe(true);
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id: 'mail-fixture' }));
  await sendDelivery('delivery-fixture', mail, env, transport);
  expect(transport.mock.calls).toHaveLength(1);
  const call = transport.mock.calls[0];
  expect(call[0]).toBe('https://api.resend.com/emails');
  expect(new Headers(call[1]?.headers).get('Idempotency-Key')).toBe(
    'delivery-fixture',
  );
  transport.mockResolvedValue(Response.json({}, { status: 503 }));
  await expect(
    sendDelivery('delivery-fixture', mail, env, transport),
  ).rejects.toThrow();
});
