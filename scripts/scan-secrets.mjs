import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { credentialFindings } from './credential-rules.mjs';
const root = resolve('.');
const privatePath = (path) =>
  /(^|\/)(?:\.dev-outbox|\.wrangler|\.local-tools)(?:\/|$)/.test(path) ||
  (/(^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/.test(path) &&
    !path.endsWith('/.dev.vars.example') &&
    path !== '.dev.vars.example');
const git = (args) => {
  const result = spawnSync('git', ['ls-files', '-z', ...args, '--', '.'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw Error('Git file inventory unavailable.');
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'));
};
const walk = (path) =>
  !existsSync(path)
    ? []
    : readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isSymbolicLink()
          ? []
          : entry.isDirectory()
            ? walk(path + '/' + entry.name)
            : [path + '/' + entry.name],
      );
let failures = 0,
  scanned = 0,
  archives = 0;
function fail(path, kinds) {
  console.error(path + ': ' + kinds.join(', ') + '; values withheld');
  failures++;
}
function scan(path, bytes, assignments = true) {
  const findings = credentialFindings(bytes.toString('utf8'), { assignments });
  if (bytes[0] === 255 && bytes[1] === 254)
    findings.push(
      ...credentialFindings(bytes.toString('utf16le'), { assignments }),
    );
  if (findings.length) fail(path, [...new Set(findings)]);
  scanned++;
}
try {
  for (const path of git(['--cached']))
    if (privatePath(path)) fail(path, ['private file tracked by Git']);
  const files = new Set([
    ...git(['--cached', '--others', '--exclude-standard']),
    ...walk('dist'),
    ...walk('output/security/worker'),
    ...walk('output/downloads'),
    ...walk('output/releases'),
  ]);
  for (const path of files) {
    if (
      privatePath(path) ||
      /^(?:node_modules|output\/performance)\//.test(path) ||
      !existsSync(path)
    )
      continue;
    const absolute = resolve(path);
    if (
      relative(root, absolute).startsWith('..') ||
      lstatSync(absolute).isSymbolicLink()
    ) {
      fail(path, ['unsafe scan path']);
      continue;
    }
    const bytes = readFileSync(absolute);
    if (extname(path) === '.zip') {
      archives++;
      try {
        for (const value of Object.values(unzipSync(bytes))) {
          scan(path + ' [archive entry]', Buffer.from(value));
          if (
            process.argv.includes('--release') &&
            path.startsWith('output/releases/') &&
            Buffer.from(value)
              .toString('utf8')
              .includes(
                'PLACEHOLDER: this is a test download, not the real app',
              )
          )
            fail(path, ['placeholder ZIP is not a release']);
        }
      } catch {
        fail(path, ['archive could not be scanned']);
      }
    } else scan(path, bytes, path !== 'CODEX_BUILD_PROMPT.md');
  }
  if (
    process.argv.includes('--artifacts') &&
    (!existsSync('output/security/worker/index.js') || !archives)
  )
    fail('Build artifacts', ['Worker bundle or sample ZIP missing']);
  if (
    process.argv.includes('--release') &&
    !existsSync('output/releases/ornament-bulk-creator-1.0.0.zip')
  )
    fail('Release archive', ['reviewed real app ZIP missing']);
  if (failures) process.exitCode = 1;
  else
    console.log(
      `Credential scan passed: ${scanned} files/archive entries, ${archives} ZIP archive(s). Private local values were not opened.`,
    );
} catch {
  console.error('Credential scan could not finish. Values withheld.');
  process.exitCode = 1;
}
