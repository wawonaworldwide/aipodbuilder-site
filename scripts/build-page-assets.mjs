import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import matter from './frontmatter.mjs';
const drafts = process.env.SHOW_DRAFTS === 'true';
const redirects = [];
for (const name of readdirSync('src/content/episodes').filter((n) =>
  n.endsWith('.md'),
)) {
  const { data } = matter(readFileSync(`src/content/episodes/${name}`, 'utf8'));
  if (data.status === 'draft' && !drafts) continue;
  redirects.push(
    `/free/${data.format === 'S' ? data.id : data.number} /episodes/${data.slug}/#prompts 302`,
    `/free/${data.format === 'S' ? data.id : data.number}/ /episodes/${data.slug}/#prompts 302`,
  );
}
writeFileSync('dist/_redirects.tmp', redirects.join('\n') + '\n');
renameSync('dist/_redirects.tmp', 'dist/_redirects');
console.log(`Built ${redirects.length / 2} episode short links.`);

// Static build files need explicit MIME types; API paths also pass through the Worker.
const rules = [
  ['/*.md', 'text/markdown; charset=utf-8'],
  ['/api/*', 'application/json; charset=utf-8'],
  ['/rss.xml', 'application/rss+xml; charset=utf-8'],
  ['/sitemap.xml', 'application/xml; charset=utf-8'],
  ['/llms.txt', 'text/plain; charset=utf-8'],
  ['/llms-full.txt', 'text/plain; charset=utf-8'],
];
const indexable =
  process.env.PUBLIC_DEPLOY_ENV === 'production' &&
  process.env.PUBLIC_INDEXABLE === 'true';
const headers =
  rules
    .map(
      ([path, type]) =>
        `${path}\n  Content-Type: ${type}\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=300\n  X-Content-Type-Options: nosniff${indexable ? '' : '\n  X-Robots-Tag: noindex'}`,
    )
    .join('\n\n') + '\n';
writeFileSync('dist/_headers.tmp', headers);
renameSync('dist/_headers.tmp', 'dist/_headers');

// Reuse Astro's draft-filtered HTML sitemap entries at the conventional URL.
const sitemapEntries = readdirSync('dist')
  .filter((name) => /^sitemap-\d+\.xml$/.test(name))
  .flatMap((name) =>
    [
      ...readFileSync('dist/' + name, 'utf8').matchAll(/<url>[\s\S]*?<\/url>/g),
    ].map((match) => match[0]),
  );
if (!sitemapEntries.length) throw new Error('No public sitemap entries.');
writeFileSync(
  'dist/sitemap.xml.tmp',
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    sitemapEntries.join('') +
    '</urlset>\n',
);
renameSync('dist/sitemap.xml.tmp', 'dist/sitemap.xml');
