import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { env } from 'cloudflare:workers';
import schema from '../../migrations/0001_init.sql?raw';
import { subscribe, signupTags } from '../../worker/subscribe';
import { saveKit } from '../../worker/email/kit';
import { verifyTurnstile } from '../../worker/security/turnstile';
import { allowSignup } from '../../worker/security/ratelimit';
import worker from '../../worker/index';
import type { Env } from '../../worker/env';
const config = () =>
  ({ ...env, RATE_LIMITER: { limit: async () => ({ success: true }) } }) as Env;
const input = (extra: Record<string, unknown> = {}) => ({
  email: 'fixture@example.test',
  source: '/newsletter/',
  company: '',
  'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
  ...extra,
});
const request = (
  body: Record<string, unknown>,
  origin = 'http://localhost:8787',
) =>
  new Request('http://localhost:8787/api/subscribe', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeAll(async () => {
  await env.DB.exec(schema.replace(/^--.*$/gm, ''));
});
beforeEach(async () => {
  await env.DB.batch(
    ['subscribers', 'email_outbox', 'signup_rate_events'].map((table) =>
      env.DB.prepare('DELETE FROM ' + table),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());
it('saves an ungated weekly signup privately with no cookie or email in the response', async () => {
  const response = await worker.fetch(request(input()), config());
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const result = await response.json();
  expect(result).toEqual({
    ok: true,
    message: 'Saved locally. No email was sent.',
  });
  const row = await env.DB.prepare('SELECT tags FROM subscribers').first<{
    tags: string;
  }>();
  expect(JSON.parse(row!.tags)).toEqual(['weekly-niches']);
  expect(
    (
      await env.DB.prepare('SELECT COUNT(*) AS n FROM email_outbox').first<{
        n: number;
      }>()
    )?.n,
  ).toBe(1);
});
it('accepts ordinary URL-encoded forms', async () => {
  const form = new URLSearchParams(input() as Record<string, string>);
  const response = await subscribe(
    new Request('http://localhost:8787/api/subscribe', {
      method: 'POST',
      headers: { Origin: 'http://localhost:8787' },
      body: form,
    }),
    config(),
  );
  expect(response.status).toBe(200);
});
it.each([
  ['weekly', false, false, ['weekly-niches']],
  ['weekly', true, false, ['weekly-niches', 'app-updates']],
  ['weekly', false, true, ['weekly-niches', 'launch-coupons']],
  ['weekly', true, true, ['weekly-niches', 'app-updates', 'launch-coupons']],
  ['updates', false, false, ['app-updates']],
  ['launch', false, false, ['app-updates', 'launch-coupons']],
] as const)(
  'builds tags for %s with opt-ins %s/%s',
  async (mode, app_updates, launch_coupons, tags) => {
    expect(signupTags({ mode, app_updates, launch_coupons })).toEqual(tags);
    const response = await subscribe(
      request(
        input({
          mode,
          app_updates,
          launch_coupons,
          source:
            mode === 'weekly' ? '/newsletter/' : '/apps/ornament-bulk-creator/',
        }),
      ),
      config(),
    );
    expect(response.status).toBe(200);
    const row = await env.DB.prepare('SELECT tags FROM subscribers').first<{
      tags: string;
    }>();
    expect(JSON.parse(row!.tags)).toEqual(tags);
  },
);
it('merges duplicate consent atomically without changing the response', async () => {
  const cfg = { ...config(), EMAIL_PROVIDER: 'd1' as const };
  const first = await subscribe(request(input()), cfg);
  const second = await subscribe(request(input({ app_updates: true })), cfg);
  expect(await second.json()).toEqual(await first.json());
  const rows = await env.DB.prepare('SELECT tags FROM subscribers').all<{
    tags: string;
  }>();
  expect(rows.results).toHaveLength(1);
  expect(JSON.parse(rows.results[0].tags).sort()).toEqual([
    'app-updates',
    'weekly-niches',
  ]);
});
it.each([
  ['tags', ['owner-ornament-bulk-creator']],
  ['tags', ['weekly-niches']],
  ['tags', ['unknown']],
  ['owner_slug', 'ornament-bulk-creator'],
])('rejects client-supplied %s', async (key, value) => {
  expect(
    (await subscribe(request(input({ [key as string]: value })), config()))
      .status,
  ).toBe(400);
  expect(
    (
      await env.DB.prepare('SELECT COUNT(*) AS n FROM subscribers').first<{
        n: number;
      }>()
    )?.n,
  ).toBe(0);
});
it('rejects foreign origins before rate limiting or provider work', async () => {
  expect(
    (await subscribe(request(input(), 'https://foreign.example'), config()))
      .status,
  ).toBe(403);
  expect(
    (
      await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM signup_rate_events',
      ).first<{ n: number }>()
    )?.n,
  ).toBe(0);
});
it('quietly accepts the honeypot without saving anything or checking Turnstile', async () => {
  const response = await subscribe(
    request(input({ company: 'bot', 'cf-turnstile-response': '' })),
    config(),
  );
  expect(response.status).toBe(200);
  expect(
    (
      await env.DB.prepare('SELECT COUNT(*) AS n FROM subscribers').first<{
        n: number;
      }>()
    )?.n,
  ).toBe(0);
});
it.each([
  { email: 'not-an-email' },
  { 'cf-turnstile-response': 'wrong' },
  { source: 'https://foreign.example/' },
  { source: 'https://[' },
  { app_updates: 'not-a-boolean' },
])('rejects invalid input', async (extra) => {
  expect((await subscribe(request(input(extra)), config())).status).toBe(400);
});
it('returns 429 on attempt six and admits a new attempt after ten minutes', async () => {
  const cfg = config();
  const req = request(input());
  const allowed = await Promise.all(
    Array.from({ length: 6 }, () => allowSignup(req, cfg, 1000)),
  );
  expect(allowed.filter(Boolean)).toHaveLength(5);
  expect(await allowSignup(req, cfg, 601001)).toBe(true);
});
it('returns a friendly 429 with a retry time', async () => {
  const cfg = config();
  for (let i = 0; i < 5; i++)
    await subscribe(request(input({ email: 'invalid' })), cfg);
  const response = await subscribe(request(input()), cfg);
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('600');
});
it('fails closed if the limiter or provider fails', async () => {
  const cfg = {
    ...config(),
    RATE_LIMITER: {
      limit: async () => {
        throw Error('fixture');
      },
    },
  } as Env;
  expect((await subscribe(request(input()), cfg)).status).toBe(503);
  expect(
    (await subscribe(request(input()), { ...config(), EMAIL_PROVIDER: 'kit' }))
      .status,
  ).toBe(503);
});
it('checks Turnstile hostname/action and never enables test bypass remotely', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      success: true,
      hostname: 'aipodbuilder.com',
      action: 'subscribe',
    }),
  );
  const remote = new Request('https://aipodbuilder.com/api/subscribe');
  const cfg = {
    ...config(),
    PUBLIC_SITE_URL: 'https://aipodbuilder.com',
    LOCAL_DEV: 'false',
    TURNSTILE_MODE: 'verify' as const,
    TURNSTILE_SECRET_KEY: String('fixture-only'),
  };
  expect(await verifyTurnstile('fixture-token', remote, cfg, transport)).toBe(
    true,
  );
  transport.mockResolvedValue(
    Response.json({
      success: true,
      hostname: 'foreign.example',
      action: 'subscribe',
    }),
  );
  expect(await verifyTurnstile('fixture-token', remote, cfg, transport)).toBe(
    false,
  );
  transport.mockResolvedValue(
    Response.json({
      success: true,
      hostname: 'aipodbuilder.com',
      action: 'wrong',
    }),
  );
  expect(await verifyTurnstile('fixture-token', remote, cfg, transport)).toBe(
    false,
  );
  expect(
    await verifyTurnstile(
      'XXXX.DUMMY.TOKEN.XXXX',
      remote,
      { ...cfg, LOCAL_DEV: 'true', TURNSTILE_MODE: 'mock' },
      transport,
    ),
  ).toBe(false);
});
describe('Kit adapter, mocked network only', () => {
  const cfg = () => ({
    ...config(),
    KIT_API_KEY: String('fixture-only'),
    KIT_FORM_ID: String('10'),
    KIT_UPDATES_FORM_ID: '11',
    KIT_TAG_WEEKLY_NICHES: '20',
    KIT_TAG_APP_UPDATES: '21',
    KIT_TAG_LAUNCH_COUPONS: '22',
  });
  it('upserts inactive, submits to the confirmation form and applies only opted-in tags', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith('/subscribers') &&
        String(url).includes('/v4/subscribers')
          ? Response.json({ subscriber: { id: 123 } })
          : Response.json({}),
      );
    await saveKit(
      {
        email: 'fixture@example.test',
        source: 'https://aipodbuilder.com/newsletter/?utm_source=test',
        tags: ['weekly-niches', 'app-updates'],
      },
      cfg(),
      transport,
    );
    expect(transport.mock.calls.map((c) => c[0])).toEqual([
      'https://api.kit.com/v4/subscribers',
      'https://api.kit.com/v4/forms/10/subscribers',
      'https://api.kit.com/v4/tags/20/subscribers/123',
      'https://api.kit.com/v4/tags/21/subscribers/123',
    ]);
    expect(JSON.parse(transport.mock.calls[0][1]!.body as string).state).toBe(
      'inactive',
    );
  });

  it.each([
    ['weekly', false, false, ['20']],
    ['weekly', true, false, ['20', '21']],
    ['weekly', false, true, ['20', '22']],
    ['weekly', true, true, ['20', '21', '22']],
    ['updates', false, false, ['21']],
    ['launch', false, false, ['21', '22']],
  ] as const)(
    'preserves %s consent on the shared double-opt-in form (%s/%s)',
    async (mode, app_updates, launch_coupons, expectedIds) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json({ subscriber: { id: 123 } }),
        );
      const source = 'https://preview.example.test/newsletter/';
      await saveKit(
        {
          email: 'fixture@example.test',
          source,
          tags: signupTags({ mode, app_updates, launch_coupons }),
        },
        {
          ...cfg(),
          KIT_SIGNUP_FORM_ID: '30',
          KIT_FORM_ID: undefined,
          KIT_UPDATES_FORM_ID: undefined,
        },
        transport,
      );
      expect(transport.mock.calls.map((c) => c[0])).toEqual([
        'https://api.kit.com/v4/subscribers',
        'https://api.kit.com/v4/forms/30/subscribers',
        ...expectedIds.map(
          (id) => 'https://api.kit.com/v4/tags/' + id + '/subscribers/123',
        ),
      ]);
      expect(JSON.parse(transport.mock.calls[0][1]!.body as string).state).toBe(
        'inactive',
      );
      expect(JSON.parse(transport.mock.calls[1][1]!.body as string)).toEqual({
        email_address: 'fixture@example.test',
        referrer: source,
      });
      expect(transport.mock.calls.every((c) => c[1]?.method === 'POST')).toBe(
        true,
      );
    },
  );
  it.each(['', 'invalid', '30/other'])(
    'fails closed for an invalid shared form %s without falling back',
    async (form) => {
      const transport = vi.fn<typeof fetch>();
      await expect(
        saveKit(
          {
            email: 'fixture@example.test',
            source: '/',
            tags: ['weekly-niches'],
          },
          { ...cfg(), KIT_SIGNUP_FORM_ID: form },
          transport,
        ),
      ).rejects.toThrow('Email setup is incomplete.');
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'stops after Kit rejects request %s and withholds provider response data',
    async (failedIndex) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          transport.mock.calls.length - 1 === failedIndex
            ? new Response('private provider error fixture', { status: 422 })
            : Response.json({ subscriber: { id: 123 } }),
        );
      await expect(
        saveKit(
          {
            email: 'fixture@example.test',
            source: '/',
            tags: ['app-updates', 'launch-coupons'],
          },
          { ...cfg(), KIT_SIGNUP_FORM_ID: '30' },
          transport,
        ),
      ).rejects.toThrow('Email provider unavailable.');
      expect(transport).toHaveBeenCalledTimes(failedIndex + 1);
    },
  );

  it('uses a separate confirmation form for app-only signups', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ subscriber: { id: 123 } }));
    await saveKit(
      {
        email: 'fixture@example.test',
        source: 'https://aipodbuilder.com/apps/ornament-bulk-creator/',
        tags: ['app-updates'],
      },
      cfg(),
      transport,
    );
    expect(transport.mock.calls[1][0]).toContain('/forms/11/');
    expect(transport.mock.calls).toHaveLength(3);
  });
  it('does not send any request with incomplete setup', async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      saveKit(
        { email: 'fixture@example.test', source: '/', tags: ['app-updates'] },
        { ...cfg(), KIT_UPDATES_FORM_ID: undefined },
        transport,
      ),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});

it('uses the documented public test value only on localhost', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ success: true }));
  expect(
    await verifyTurnstile(
      'XXXX.DUMMY.TOKEN.XXXX',
      request(input()),
      { ...config(), TURNSTILE_MODE: 'verify' },
      transport,
    ),
  ).toBe(true);
  const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
  // Assert the published dummy value shape without exposing any key in test output.
  expect(body.secret.startsWith('1x') && body.secret.endsWith('AA')).toBe(true);
  expect(body.secret.slice(2, -2).length).toBe(31);
  expect(new Set(body.secret.slice(2, -2))).toEqual(new Set(['0']));
});
