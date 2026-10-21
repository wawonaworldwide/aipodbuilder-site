import { verifyDiscoveryBuild } from './verify-discovery-build.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import matter from './frontmatter.mjs';
import { extractPrompt } from '../src/lib/markdown.ts';
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
function build(drafts) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run npm run test:builds.');
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: '1',
      SHOW_DRAFTS: String(drafts),
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw Error('Build failed');
  }
  console.log(`Build passed: SHOW_DRAFTS=${drafts}`);
}
function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(`${dir}/${e.name}`)
      : e.name.endsWith('.html')
        ? [`${dir}/${e.name}`]
        : [],
  );
}
const groups = {
  episodes: 'episodes',
  prompts: 'prompts',
  loops: 'loops',
  posts: 'blog',
  products: 'apps',
};
build(false);
verifyDiscoveryBuild(false);
const publicHtml = htmlFiles('dist')
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');
for (const [collection, path] of Object.entries(groups))
  for (const file of readdirSync(`src/content/${collection}`).filter((n) =>
    /\.mdx?$/.test(n),
  )) {
    const id = file.replace(/\.mdx?$/, '');
    assert.equal(
      existsSync(`dist/${path}/${id}/index.html`),
      false,
      `Draft route leaked: ${path}/${id}`,
    );
    assert.equal(
      publicHtml.includes(id),
      false,
      `Draft reference leaked: ${id}`,
    );
  }
assert.equal(readFileSync('dist/_redirects', 'utf8').trim(), '');
assert(!publicHtml.includes('DRAFT — to be reviewed.'));
console.log(
  'Production build excludes all seed content and draft short links.',
);
build(true);
verifyDiscoveryBuild(true);
for (const [collection, path] of Object.entries(groups))
  for (const file of readdirSync(`src/content/${collection}`).filter((n) =>
    /\.mdx?$/.test(n),
  )) {
    const id = file.replace(/\.mdx?$/, '');
    const html = readFileSync(`dist/${path}/${id}/index.html`, 'utf8');
    assert(html.includes('DRAFT'), `Draft ribbon missing: ${id}`);
  }
for (const file of readdirSync('src/content/prompts').filter((n) =>
  n.endsWith('.md'),
)) {
  const { data, content } = matter(
    readFileSync(`src/content/prompts/${file}`, 'utf8'),
  );
  const expected = extractPrompt(content);
  const episodeFile = readdirSync('src/content/episodes').find((name) =>
    name.startsWith(data.episode + '-'),
  );
  assert(episodeFile);
  for (const route of [
    `prompts/${file.slice(0, -3)}`,
    `episodes/${episodeFile.slice(0, -3)}`,
  ]) {
    const html = readFileSync(`dist/${route}/index.html`, 'utf8');
    const blocks = [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map(
      (m) => decode(m[1]),
    );
    assert(blocks.includes(expected), `Exact prompt missing: ${route}`);
  }
}
const product = decode(
  readFileSync('dist/apps/ornament-bulk-creator/index.html', 'utf8'),
);
assert(product.includes('$24.99 + tax'));
assert(
  readFileSync('dist/_redirects', 'utf8').includes(
    '/free/11 /episodes/e11-image-api-ranker/#prompts 302',
  ),
);
console.log(
  'Preview build includes every draft route, ribbon, exact prompt and required price + tax label.',
);
build(false);
verifyDiscoveryBuild(false);
console.log('Finished with a standard build: drafts hidden.');
