import {
  privateBrandPresent,
  disallowedCopyPresent,
  paletteIssues,
  ownerNamePresent,
  pricePlacementIssue,
} from './content-rules.mjs';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import matter from './frontmatter.mjs';
const issues = [];
function files(root) {
  return existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)],
      )
    : [];
}
for (const root of process.argv.includes('--source-only')
  ? ['src', 'public']
  : ['src', 'public', 'dist'])
  for (const file of files(root)) {
    if (
      ![
        '.astro',
        '.css',
        '.ts',
        '.js',
        '.mjs',
        '.md',
        '.mdx',
        '.html',
        '.svg',
        '.json',
        '.txt',
        '.xml',
      ].includes(extname(file))
    )
      continue;
    const source = readFileSync(file, 'utf8');
    if (privateBrandPresent(source))
      issues.push(`${relative('.', file)}: prohibited private brand reference`);
    if (ownerNamePresent(source))
      issues.push(`${file}: owner name is not public copy`);
    if (root === 'dist' && pricePlacementIssue(relative('dist', file), source))
      issues.push(`${file}: price outside an allowed product/legal route`);
    let copy = '';
    if (/\.mdx?$/.test(file)) {
      const { data, content } = matter(source);
      copy = JSON.stringify(data) + content;
      for (const field of ['summary', 'description'])
        if (typeof data[field] === 'string' && data[field].length > 160)
          issues.push(`${file}: ${field} exceeds 160 characters`);
      if (
        file.includes('loops') &&
        (!data.stop_conditions?.length || !data.approval_boundaries?.length)
      )
        issues.push(
          `${file}: loop needs stop conditions and approval boundaries`,
        );
    } else if (/\.(astro|html|svg)$/.test(file)) {
      copy = source
        .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ');
    }
    if (disallowedCopyPresent(copy))
      issues.push(`${file}: disallowed promotional wording`);
  }
if (ownerNamePresent(readFileSync('scripts/build-og.mjs', 'utf8')))
  issues.push('Social image source: owner name is not public copy');
const canonicalPath = '../studio/src/constants/palette.ts';
issues.push(
  ...paletteIssues(
    readFileSync('src/styles/tokens.css', 'utf8'),
    readFileSync(
      existsSync(canonicalPath)
        ? canonicalPath
        : 'tests/fixtures/studio-palette.ts',
      'utf8',
    ),
  ),
);
if (issues.length) {
  issues.forEach((e) => console.error(e));
  process.exitCode = 1;
} else console.log('Content checks passed (src, public, dist).');
