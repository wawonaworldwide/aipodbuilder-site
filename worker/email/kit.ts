import type { Env } from '../env';
import type { Signup, SignupTag } from './types';
export async function saveKit(
  signup: Signup,
  env: Env,
  transport: typeof fetch = fetch,
) {
  // The shared form must be neutral: only explicit signup consent adds tags.
  // Retain the older two-form configuration for environments not yet migrated.
  const form =
    env.KIT_SIGNUP_FORM_ID ??
    (signup.tags.includes('weekly-niches')
      ? env.KIT_FORM_ID
      : env.KIT_UPDATES_FORM_ID);
  const ids: Record<SignupTag, string | undefined> = {
    'weekly-niches': env.KIT_TAG_WEEKLY_NICHES,
    'app-updates': env.KIT_TAG_APP_UPDATES,
    'launch-coupons': env.KIT_TAG_LAUNCH_COUPONS,
  };
  if (
    !env.KIT_API_KEY ||
    !form ||
    !/^\d+$/.test(form) ||
    signup.tags.some((tag) => !ids[tag] || !/^\d+$/.test(ids[tag]!))
  )
    throw new Error('Email setup is incomplete.');
  const post = async (path: string, body: unknown) => {
    const result = await transport('https://api.kit.com/v4' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': env.KIT_API_KEY!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error('Email provider unavailable.');
    return result;
  };
  const created = (await (
    await post('/subscribers', {
      email_address: signup.email,
      first_name: signup.first_name || null,
      state: 'inactive',
    })
  ).json()) as { subscriber?: { id?: number } };
  const id = created.subscriber?.id;
  if (!Number.isSafeInteger(id) || !id || id < 1)
    throw new Error('Email provider response unavailable.');
  await post(`/forms/${form}/subscribers`, {
    email_address: signup.email,
    referrer: signup.source,
  });
  for (const tag of signup.tags)
    await post(`/tags/${ids[tag]}/subscribers/${id}`, {});
  return id;
}
