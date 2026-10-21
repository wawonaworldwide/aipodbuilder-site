import { z } from 'zod';
import type { Env } from './env';
import type { SignupTag } from './email/types';
import { saveSignup } from './email';
import { allowSignup } from './security/ratelimit';
import { localRequest, verifyTurnstile } from './security/turnstile';
const checkbox = z
  .union([z.boolean(), z.literal('on'), z.literal('true'), z.literal('false')])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true');
const shape = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    first_name: z
      .string()
      .trim()
      .max(80)
      .refine((value) =>
        [...value].every((character) => character.charCodeAt(0) >= 32),
      )
      .optional(),
    source: z.string().min(1).max(1500),
    episode: z
      .string()
      .regex(/^e\d+$/)
      .optional(),
    mode: z.enum(['weekly', 'updates', 'launch']).default('weekly'),
    app_updates: checkbox,
    launch_coupons: checkbox,
    company: z.literal('').optional(),
    'cf-turnstile-response': z.string().max(2048),
  })
  .strict();
function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...headers,
    },
  });
}
const fail = (message: string, status = 400, field?: string) =>
  json({ ok: false, message, ...(field ? { field } : {}) }, status);
function success(env: Env, mode: unknown) {
  const local = env.EMAIL_PROVIDER === 'log' || env.LOCAL_DEV === 'true';
  const message = local
    ? 'Saved locally. No email was sent.'
    : env.EMAIL_PROVIDER === 'd1'
      ? 'Your preferences were saved. Confirmation emails are not connected yet.'
      : mode === 'weekly'
        ? 'Check your inbox to confirm. Your first weekly niches + bonus prompts arrive with the next issue.'
        : 'Check your inbox to confirm your app alerts.';
  return json({ ok: true, message });
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw Error('body');
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw Error('body');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw Error('body');
    return body;
  }
  if (
    !type.includes('application/x-www-form-urlencoded') &&
    !type.includes('multipart/form-data')
  )
    throw Error('body');
  const form = await new Response(bytes, {
    headers: { 'Content-Type': type },
  }).formData();
  const data: Record<string, unknown> = {};
  for (const [key, value] of form) {
    if (key in data || typeof value !== 'string') throw Error('body');
    data[key] = value;
  }
  return data;
}
export function signupTags(input: {
  mode: 'weekly' | 'updates' | 'launch';
  app_updates: boolean;
  launch_coupons: boolean;
}): SignupTag[] {
  const tags = new Set<SignupTag>(
    input.mode === 'weekly' ? ['weekly-niches'] : ['app-updates'],
  );
  if (input.app_updates) tags.add('app-updates');
  if (input.launch_coupons || input.mode === 'launch')
    tags.add('launch-coupons');
  return [...tags];
}
export async function subscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST')
    return json({ ok: false, message: 'Please use the signup form.' }, 405, {
      Allow: 'POST',
    });
  const origin = request.headers.get('Origin');
  const expected = new URL(env.PUBLIC_SITE_URL).origin;
  const local = localRequest(request, env);
  if (
    !origin ||
    (origin !== expected &&
      !(
        local &&
        ['http://localhost:4321', 'http://localhost:8787'].includes(origin)
      ))
  )
    return fail('Please open the signup form on this site and try again.', 403);
  try {
    if (!(await allowSignup(request, env)))
      return json(
        {
          ok: false,
          message:
            'A few too many tries. Please wait ten minutes and try again.',
        },
        429,
        { 'Retry-After': '600' },
      );
    let data: Record<string, unknown>;
    try {
      data = await readBody(request);
    } catch {
      return fail('That form could not be read. Please try again.');
    }
    if (typeof data.company === 'string' && data.company !== '')
      return success(env, data.mode);
    if (!(await verifyTurnstile(data['cf-turnstile-response'], request, env)))
      return fail(
        'Please finish the bot check, then try again.',
        400,
        'turnstile',
      );
    const parsed = shape.safeParse(data);
    if (!parsed.success) {
      const email = parsed.error.issues.some((i) => i.path[0] === 'email');
      return fail(
        email
          ? 'That email looks off. Mind checking it?'
          : 'Those form options look off. Please reload the page and try again.',
        400,
        email ? 'email' : undefined,
      );
    }
    const input = parsed.data;
    let source: URL;
    try {
      source = new URL(input.source, origin);
    } catch {
      return fail('Please open a signup form on this site.');
    }
    if (source.origin !== origin || !/^\/[a-z0-9\-/]*$/.test(source.pathname))
      return fail('Please open a signup form on this site.');
    if (
      input.mode !== 'weekly' &&
      !/^\/apps\/[a-z0-9-]+\/$/.test(source.pathname)
    )
      return fail('Please use the app page for update alerts.');
    const safeSource = new URL(source.pathname, expected);
    for (const name of [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ]) {
      const value = source.searchParams.get(name);
      if (value && value.length <= 120)
        safeSource.searchParams.set(name, value);
    }
    await saveSignup(
      {
        email: input.email,
        first_name: input.first_name,
        source: safeSource.href,
        episode: input.episode,
        tags: signupTags(input),
      },
      env,
    );
    return success(env, input.mode);
  } catch {
    return fail('Signup is taking a break. Please try again in a moment.', 503);
  }
}
