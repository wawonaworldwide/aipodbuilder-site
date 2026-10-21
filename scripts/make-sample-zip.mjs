import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import matter from './frontmatter.mjs';
import { localConfig } from './local-config.mjs';
const p = matter(
  readFileSync('src/content/products/ornament-bulk-creator.md', 'utf8'),
).data;
const license = matter(
  readFileSync('src/content/legal/license.md', 'utf8'),
).content;
const files = {
  'README.md':
    'PLACEHOLDER: this is a test download, not the real app\n\nNo app code, sign-in or API key is included.\n',
  'LICENSE.txt': license,
  'THIRD_PARTY_NOTICES.txt':
    'This placeholder ZIP contains text files only. It includes no third-party application code.\n',
};
const archive = zipSync(
  Object.fromEntries(
    Object.entries(files).map(([name, text]) => [
      p.slug + '/' + name,
      strToU8(text),
    ]),
  ),
);
const patterns = [
  /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{16,}/,
  /\bwhsec_[A-Za-z0-9]{16,}/,
  /\bre_[A-Za-z0-9]{20,}/,
  /-----BEGIN .*PRIVATE KEY-----/,
];
for (const bytes of Object.values(unzipSync(archive)))
  if (patterns.some((re) => re.test(strFromU8(bytes))))
    throw Error('Sample archive credential scan failed; value withheld.');
mkdirSync('output/downloads', { recursive: true });
const file = `output/downloads/${p.slug}-${p.version}.zip`;
writeFileSync(file + '.tmp', archive);
renameSync(file + '.tmp', file);
const { path } = localConfig();
const result = spawnSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'r2',
    'object',
    'put',
    'aipb-downloads/' + p.r2_key,
    '--file',
    file,
    '--local',
    '--persist-to',
    '.wrangler/state',
    '--config',
    path,
  ],
  { encoding: 'utf8', windowsHide: true, env: process.env },
);
if (result.status !== 0) {
  console.error(
    'Placeholder ZIP was built and scanned, but local storage setup failed.',
  );
  process.exitCode = 1;
} else
  console.log(
    'Placeholder ZIP built, scanned and put in local R2. No remote storage changed.',
  );
