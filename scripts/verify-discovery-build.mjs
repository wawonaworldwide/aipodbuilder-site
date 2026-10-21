import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import matter from './frontmatter.mjs';
const read = (path) => readFileSync('dist/' + path, 'utf8');
const parse = (path) => JSON.parse(read(path));
function htmlFiles(dir = 'dist') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(dir + '/' + e.name)
      : e.name.endsWith('.html')
        ? [dir + '/' + e.name]
        : [],
  );
}
export function verifyDiscoveryBuild(drafts) {
  const loops = parse('api/loops.json');
  const prompts = parse('api/prompts.json');
  const skills = parse('api/skills.json');
  assert.equal(loops.count, drafts ? 2 : 0);
  assert.equal(prompts.count, drafts ? 6 : 3);
  assert.equal(skills.count, 0);
  assert.equal(loops.license, 'MIT');
  for (const loop of loops.loops) {
    assert.equal(loop.status, drafts ? 'draft' : 'tested');
    assert.deepEqual(parse('api/loops/' + loop.slug + '.json'), loop);
    assert(loop.stop_conditions.length && loop.approval_boundaries.length);
  }
  const full = read('llms-full.txt');
  for (const prompt of prompts.prompts) {
    assert(full.includes(prompt.prompt));

    if (!drafts && prompt.url.includes('/free/s01/')) {
      assert(read('free/s01.md').includes(prompt.prompt));
      assert.equal(prompt.status, 'draft');
      assert(
        !existsSync('dist/episodes/s01-day-with-my-pod-pipeline/index.html'),
      );
      continue;
    }
    assert(read('prompts/' + prompt.id + '.md').includes(prompt.prompt));
    const episode = readdirSync('src/content/episodes').find((f) =>
      f.startsWith(prompt.episode + '-'),
    );
    assert(read('episodes/' + episode).includes(prompt.prompt));
  }
  assert.match(read('_headers'), /Content-Type: text\/markdown; charset=utf-8/);
  assert(read('robots.txt').includes('Allow: /api/loops/'));
  const sitemapFiles = readdirSync('dist').filter((f) =>
    /^sitemap-\d+\.xml$/.test(f),
  );
  assert(sitemapFiles.length > 0, 'HTML sitemap must not be empty');
  assert(
    read('robots.txt').includes(
      'Sitemap: https://aipodbuilder.com/sitemap.xml',
    ),
  );
  assert.equal(
    (read('sitemap.xml').match(/<url>/g) ?? []).length,
    sitemapFiles.flatMap((f) => [...read(f).matchAll(/<url>/g)]).length,
  );
  sitemapFiles.push('sitemap.xml');
  const locations = new Set(
    sitemapFiles.flatMap((f) =>
      [...read(f).matchAll(/<loc>(.*?)<\/loc>/g)].map(
        (m) => new URL(m[1]).pathname,
      ),
    ),
  );
  for (const path of locations) {
    assert(path.endsWith('/'), 'Only HTML URLs go in the sitemap');
    assert(
      (path === '/free/s01/' && !drafts) ||
        !/^\/(api|free|thanks|download)\//.test(path),
    );
    assert.notEqual(path, '/newsletter/thanks/');
    assert(
      existsSync('dist' + path + 'index.html'),
      `Sitemap target missing: ${path}`,
    );
  }
  for (const file of htmlFiles()) {
    if (drafts && file === 'dist/free/s01/index.html') {
      assert(
        readFileSync(file, 'utf8').includes(
          '/episodes/s01-day-with-my-pod-pipeline/#prompts',
        ),
      );
      continue;
    }
    const html = readFileSync(file, 'utf8');
    const blocks = [
      ...html.matchAll(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ].map((m) => JSON.parse(m[1]));
    assert(blocks.length > 0, `Missing structured data: ${file}`);
    const graph = blocks.flatMap((b) => b['@graph'] ?? [b]);
    for (const type of ['WebSite', 'Organization', 'BreadcrumbList'])
      assert(
        graph.some((n) => n['@type'] === type),
        `${type} missing: ${file}`,
      );
    const alternate = html.match(
      /<link[^>]*type="text\/markdown"[^>]*href="([^"]+)"/,
    );
    if (alternate) {
      const md = read(alternate[1].slice(1));
      assert(matter(md).content.length > 0);
    }
    if (file.endsWith('/index.html')) {
      const path = file.slice(4, -10);
      if (
        !['/thanks/', '/newsletter/thanks/'].includes(path) &&
        !path.startsWith('/download/') &&
        !(drafts && path === '/free/s01/')
      )
        assert(locations.has(path), `HTML page absent from sitemap: ${path}`);
    }
  }
  assert.equal((read('rss.xml').match(/<item>/g) ?? []).length, drafts ? 4 : 0);
  console.log(
    `Discovery build passed: drafts ${drafts ? 'shown' : 'hidden'}, valid feeds, Markdown, structured data and HTML sitemap.`,
  );
}
