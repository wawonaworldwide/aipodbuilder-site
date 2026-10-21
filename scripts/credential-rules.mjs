export const privateNames = [
  'STRIPE_SECRET_KEY',
  'STRIPE_SECRET_KEY_LIVE',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET_LIVE',
  'KIT_API_KEY',
  'KIT_FORM_ID',
  'RESEND_API_KEY',
  'DOWNLOAD_TOKEN_SECRET',
  'TURNSTILE_SECRET_KEY',
];
const patterns = [
  /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{16,}/,
  /\bwhsec_[A-Za-z0-9]{16,}/,
  /\bre_[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-proj-[A-Za-z0-9_-]{12,}/,
];
const names = '(?:' + privateNames.join('|') + ')';
const literal = new RegExp(
  '(?:["\']?' + names + '["\']?)[ \\t]*[:=][ \\t]*(["\'])([^\\r\\n]*?)\\1',
  'g',
);
const dotenv = new RegExp(
  '^[ \\t]*(?:export[ \\t]+)?' + names + '[ \\t]*=[ \\t]*(.*)$',
  'gm',
);
export function credentialFindings(text, { assignments = true } = {}) {
  const findings = [];
  if (patterns.some((pattern) => pattern.test(text)))
    findings.push('credential pattern');
  if (assignments) {
    for (const match of text.matchAll(literal))
      if (match[2].trim()) {
        findings.push('nonempty private-setting literal');
        break;
      }
    for (const match of text.matchAll(dotenv)) {
      const value = match[1].trim();
      if (value && !/^(?:["']{2})?(?:[ \\t]*#.*)?$/.test(value)) {
        findings.push('nonempty private-setting assignment');
        break;
      }
    }
  }
  return [...new Set(findings)];
}
