import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
export function readPrivateVars() {
  const values = {};
  if (!existsSync('.dev.vars')) return values;
  for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}
export function updatePrivateVar(name, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || /[\r\n]/.test(value))
    throw Error('Invalid local setting.');
  const prior = existsSync('.dev.vars')
    ? readFileSync('.dev.vars', 'utf8')
    : '';
  const lines = prior
    .split(/\r?\n/)
    .filter((line) => !new RegExp('^\\s*' + name + '\\s*=').test(line));
  writeFileSync(
    '.dev.vars.tmp',
    lines.join('\n').trimEnd() + '\n' + name + '=' + value + '\n',
    { mode: 0o600 },
  );
  renameSync('.dev.vars.tmp', '.dev.vars');
}
export function assertTestKey(values) {
  const key = values.STRIPE_SECRET_KEY || '';
  if (key && !/^(sk|rk)_test_/.test(key))
    throw Error(
      'A non-test Stripe key was found. Stop and replace it yourself.',
    );
}
