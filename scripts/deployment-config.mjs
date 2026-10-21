import { readFileSync } from 'node:fs';
export const readDeploymentConfig = () =>
  JSON.parse(
    readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'),
  );
export function deploymentProfile(name, config = readDeploymentConfig()) {
  if (!['preview', 'production'].includes(name) || !config.env?.[name])
    throw Error('Choose preview or production.');
  return config.env[name];
}
export function publicBuildSettings(name, config) {
  const { vars } = deploymentProfile(name, config);
  if (!['test', 'off'].includes(vars.STORE_MODE))
    throw Error('Live builds remain gated until Phase 8.');
  return {
    PUBLIC_DEPLOY_ENV: name,
    PUBLIC_EMAIL_PROVIDER: vars.EMAIL_PROVIDER,
    SHOW_DRAFTS: name === 'preview' ? 'true' : 'false',
    STORE_MODE: vars.STORE_MODE,
    PUBLIC_INDEXABLE:
      name === 'production' && vars.PUBLIC_INDEXABLE === 'true'
        ? 'true'
        : 'false',
    PUBLIC_TURNSTILE_SITE_KEY: vars.PUBLIC_TURNSTILE_SITE_KEY || '',
    PUBLIC_CF_ANALYTICS_TOKEN: vars.PUBLIC_CF_ANALYTICS_TOKEN || '',
  };
}
export function deploymentIssues(name, config) {
  const profile = deploymentProfile(name, config),
    v = profile.vars,
    issues = [];
  if (
    v.DEPLOY_ENV !== name ||
    v.LOCAL_DEV !== 'false' ||
    v.TURNSTILE_MODE !== 'verify'
  )
    issues.push('Remote safety settings are incomplete.');
  if (!['test', 'off'].includes(v.STORE_MODE))
    issues.push('Live mode requires Phase 8 implementation and approval.');
  if (
    v.SHOW_DRAFTS !== String(name === 'preview') ||
    (name === 'preview'
      ? v.PUBLIC_INDEXABLE !== 'false'
      : !['true', 'false'].includes(v.PUBLIC_INDEXABLE))
  )
    issues.push(
      'Draft visibility or prelaunch indexing settings are incorrect.',
    );
  if (!profile.assets?.run_worker_first)
    issues.push('The Worker must apply headers to every response.');
  if (
    !profile.d1_databases?.[0]?.database_id ||
    /^0{8}-/.test(profile.d1_databases[0].database_id)
  )
    issues.push('Replace the placeholder D1 database ID.');
  const other = config.env[name === 'preview' ? 'production' : 'preview'];
  if (
    profile.d1_databases?.[0]?.database_id ===
      other?.d1_databases?.[0]?.database_id ||
    (profile.r2_buckets?.[0]?.bucket_name &&
      profile.r2_buckets[0].bucket_name === other?.r2_buckets?.[0]?.bucket_name)
  )
    issues.push('Preview and production must use separate storage.');
  try {
    const url = new URL(v.PUBLIC_SITE_URL);
    if (
      url.protocol !== 'https:' ||
      /YOUR_SUBDOMAIN/i.test(url.hostname) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw Error();
  } catch {
    issues.push('Set the exact HTTPS site origin.');
  }
  if (
    !v.PUBLIC_TURNSTILE_SITE_KEY ||
    /^[123]x0+/.test(v.PUBLIC_TURNSTILE_SITE_KEY)
  )
    issues.push('Set the real public Turnstile site key.');
  if (v.STORE_MODE !== 'off' && v.MAIL_PROVIDER !== 'resend')
    issues.push('Hosted delivery requires Resend setup.');
  if (
    v.PUBLIC_CF_ANALYTICS_TOKEN &&
    !/^[a-f0-9]{32}$/i.test(v.PUBLIC_CF_ANALYTICS_TOKEN)
  )
    issues.push('Check the public Web Analytics token format.');
  if (v.EMAIL_PROVIDER === 'kit') {
    const required = profile.secrets?.required || [];
    if (!required.includes('KIT_API_KEY'))
      issues.push('Declare KIT_API_KEY as a required secret.');
    if (v.KIT_SIGNUP_FORM_ID !== undefined) {
      if (!/^[1-9]\d*$/.test(v.KIT_SIGNUP_FORM_ID))
        issues.push('Set KIT_SIGNUP_FORM_ID.');
    } else {
      if (!/^[1-9]\d*$/.test(v.KIT_UPDATES_FORM_ID || ''))
        issues.push('Set KIT_UPDATES_FORM_ID.');
      if (!required.includes('KIT_FORM_ID'))
        issues.push('Declare KIT_FORM_ID as a required secret.');
    }
    for (const key of [
      'KIT_TAG_WEEKLY_NICHES',
      'KIT_TAG_APP_UPDATES',
      'KIT_TAG_LAUNCH_COUPONS',
    ])
      if (!/^\d+$/.test(v[key] || '')) issues.push('Set ' + key + '.');
    // Buyer notifications are unavailable while checkout is off.
    if (v.STORE_MODE !== 'off') {
      try {
        const owners = JSON.parse(v.KIT_OWNER_TAGS || '{}');
        if (!/^\d+$/.test(owners['ornament-bulk-creator'] || '')) throw Error();
      } catch {
        issues.push('Configure the owner tag mapping.');
      }
    }
  } else if (v.EMAIL_PROVIDER !== 'd1')
    issues.push('Use d1 or kit for hosted signups.');
  return issues;
}
