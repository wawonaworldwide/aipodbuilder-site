import type { CollectionEntry } from 'astro:content';
import { transcripts, discoveryLabels } from './episode-editorial';
import { extractPrompt } from './markdown';
export const origin = 'https://aipodbuilder.com';
export type Collections = {
  [
    K in
      | 'episodes'
      | 'prompts'
      | 'loops'
      | 'posts'
      | 'products'
      | 'skills'
      | 'legal'
  ]: CollectionEntry<K>[];
};
export type Resource = { body: string | Uint8Array; type: string };
export const markdownType = 'text/markdown; charset=utf-8';
export const jsonType = 'application/json; charset=utf-8';
export const feedCredit = {
  title: 'Loop Library',
  author: 'Forward Future',
  url: 'https://signals.forwardfuture.com/loop-library/',
};
export const slugOfSkill = (id: string) => id.replace(/\/skill$/i, '');
const paths = {
  episodes: 'episodes',
  prompts: 'prompts',
  loops: 'loops',
  posts: 'blog',
  products: 'apps',
  skills: 'skills',
  legal: '',
};
export function entryPath(
  kind: keyof Collections,
  entry: Collections[keyof Collections][number],
): string {
  const slug =
    kind === 'skills'
      ? slugOfSkill(entry.id)
      : 'slug' in entry.data
        ? entry.data.slug
        : entry.id;
  return `/${paths[kind] ? paths[kind] + '/' : ''}${slug}/`;
}
export const markdownPath = (path: string) => path.replace(/\/$/, '') + '.md';
export const visibleStatus = (status: string, drafts: boolean) =>
  status !== 'retired' && (status !== 'draft' || drafts);
const label = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '');
const frontmatter = (data: unknown) =>
  `---\n${JSON.stringify(data, null, 2)}\n---\n\n`;
const list = (items: string[]) => items.map((s) => `- ${s}`).join('\n');
export const xml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export function contentMarkdown(
  kind: keyof Collections,
  entry: Collections[keyof Collections][number],
  all: Collections,
): string {
  const data = { ...entry.data } as Record<string, unknown>;
  // Storage object paths are implementation details, not public resource metadata.
  delete data.r2_key;
  const title = 'title' in entry.data ? entry.data.title : entry.data.name;
  let body = `${/^\s*# /.test(entry.body ?? '') ? '' : `# ${title}\n\n`}${entry.data.status === 'draft' ? '> DRAFT — not yet reviewed or tested.\n\n' : ''}${entry.body ?? ''}`;
  if (kind === 'episodes') {
    const ep = entry as CollectionEntry<'episodes'>;
    if (transcripts[ep.data.id])
      body += '\n\n## Draft transcript\n\n' + transcripts[ep.data.id];
    const prompts = all.prompts
      .filter((p) => ep.data.prompts.includes(p.id))
      .sort((a, b) => a.data.order - b.data.order);
    body +=
      '\n\n## Free prompts\n\n' +
      prompts.map((p) => `### ${p.data.title}\n\n${p.body ?? ''}`).join('\n\n');
  }
  if (kind === 'loops') {
    const d = (entry as CollectionEntry<'loops'>).data;
    body = `# ${d.name}\n\n${d.summary}\n\nStatus: ${d.status}\n\n## The loop\n\n\`\`\`text\n${d.loop_prompt}\n\`\`\`\n\n## Success check\n\n${d.success_check}\n\n## Stop conditions\n\n${list(d.stop_conditions)}\n\n## Approval boundaries\n\n${list(d.approval_boundaries)}\n\n${entry.body ?? ''}`;
  }
  if (kind === 'products') {
    const d = (entry as CollectionEntry<'products'>).data;
    body += `\n\nPrice: $${(d.price_cents / 100).toFixed(2)} + tax (one-time).\n\n## What it does\n\n${list(d.does)}\n\n## What's in the ZIP\n\n\`\`\`text\n${d.whats_in_zip}\n\`\`\`\n\n## Requirements\n\n${list(d.requirements)}\n\n## What it doesn't do\n\n${list(d.does_not)}`;
  }
  return (
    frontmatter({ ...data, url: origin + entryPath(kind, entry) }) +
    body.trimEnd() +
    '\n'
  );
}
export function robotsText(): string {
  const agents = [
    '*',
    'GPTBot',
    'OAI-SearchBot',
    'ClaudeBot',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
  ];
  return (
    agents
      .map(
        (a) =>
          `User-agent: ${a}\nAllow: /\nDisallow: /download/\nDisallow: /thanks/\nDisallow: /newsletter/thanks/\nDisallow: /api/\nAllow: /api/loops.json\nAllow: /api/loops/\nAllow: /api/prompts.json\nAllow: /api/skills.json`,
      )
      .join('\n\n') + `\n\nSitemap: ${origin}/sitemap.xml\n`
  );
}
export function createDiscovery(
  source: Collections,
  options: { drafts: boolean; license?: string },
): Map<string, Resource> {
  const all = Object.fromEntries(
    Object.entries(source).map(([k, entries]) => [
      k,
      entries.filter((e) => visibleStatus(e.data.status, options.drafts)),
    ]),
  ) as Collections;
  const resources = new Map<string, Resource>();
  const add = (path: string, body: string, type = markdownType) =>
    resources.set(path, { body, type });
  const addJson = (path: string, data: unknown) =>
    add(path, JSON.stringify(data, null, 2) + '\n', jsonType);
  for (const kind of Object.keys(all) as (keyof Collections)[])
    for (const entry of all[kind]) {
      add(
        markdownPath(entryPath(kind, entry)),
        contentMarkdown(kind, entry, all),
      );
    }
  add(
    '/about.md',
    frontmatter({ title: 'About TEE-BOT', url: origin + '/about/' }) +
      "# About TEE-BOT\n\nI'm TEE-BOT, and yes, I'm an AI. Codex builds, TEE-BOT explains, a human decides. The check is human.\n\nAI POD Builder is owned by Wawona Worldwide. Free prompts, loops and skills are readable without signup. Apps are one-time source-file downloads.\n\nKeep building your AI POD future.\n",
  );
  const loops = all.loops
    .filter(
      (e) =>
        e.data.status === 'tested' ||
        (options.drafts && e.data.status === 'draft'),
    )
    .map((e) => ({
      ...e.data,
      url: origin + entryPath('loops', e),
      markdown_url: origin + markdownPath(entryPath('loops', e)),
      category: {
        slug: e.data.category.toLowerCase().replaceAll(' ', '-'),
        label: e.data.category,
      },
    }));
  const dated = loops
    .flatMap((l) =>
      [l.date_added, l.date_tested].filter((d): d is Date => d !== null),
    )
    .sort((a, b) => +b - +a);
  const envelope = {
    name: 'AI POD Builder Loop Library',
    description:
      'Copyable agent loops for print-on-demand sellers: each repeats work with a clear success check and stop conditions.',
    home: origin + '/loops/',
    inspired_by: feedCredit,
    license: options.license || 'TBD',
    updated: dated[0]?.toISOString() ?? null,
  };
  addJson('/api/loops.json', { ...envelope, count: loops.length, loops });
  loops.forEach((loop) => addJson(`/api/loops/${loop.slug}.json`, loop));
  const prompts = all.prompts.map((e) => ({
    ...e.data,
    id: e.id,
    url: origin + entryPath('prompts', e),
    markdown_url: origin + markdownPath(entryPath('prompts', e)),
    prompt: extractPrompt(e.body ?? ''),
  }));
  addJson('/api/prompts.json', {
    name: 'AI POD Builder Free Prompts',
    home: origin + '/prompts/',
    license: options.license || 'TBD',
    count: prompts.length,
    prompts,
  });
  const skills = all.skills.map((e) => ({
    ...e.data,
    slug: slugOfSkill(e.id),
    url: origin + entryPath('skills', e),
    markdown_url: origin + markdownPath(entryPath('skills', e)),
    raw_url: origin + entryPath('skills', e) + 'SKILL.md',
    zip_url: origin + '/skills/' + slugOfSkill(e.id) + '.zip',
  }));
  addJson('/api/skills.json', {
    name: 'AI POD Builder Agent Skills',
    home: origin + '/skills/',
    count: skills.length,
    skills,
  });
  const sections: [string, keyof Collections][] = [
    ['Episodes', 'episodes'],
    ['Free prompts', 'prompts'],
    ['Loop Library', 'loops'],
    ['Agent skills', 'skills'],
    ['Blog', 'posts'],
    ['Apps', 'products'],
  ];
  let llms =
    '# AI POD Builder\n\n> Free print-on-demand build prompts, agent loops and skills, with real build notes and apps you can own.\n\nEvery prompt is free. No signup is required. Draft entries in a preview have not been checked.\n';
  for (const [heading, kind] of sections) {
    llms += `\n## ${heading}\n\n`;
    for (const e of all[kind]) {
      const d = e.data;
      const editorial = discoveryLabels['id' in d ? String(d.id) : e.id];
      const title = editorial?.title ?? ('title' in d ? d.title : d.name);
      const description =
        editorial?.description ??
        ('summary' in d && typeof d.summary === 'string'
          ? d.summary
          : 'description' in d
            ? d.description
            : title);
      llms += `- [${label(title)}](${origin}${markdownPath(entryPath(kind, e))}): ${label(description)}${d.status === 'draft' ? ' (draft)' : ''}\n`;
    }
    if (kind === 'loops')
      llms += `- [Loop Library JSON](${origin}/api/loops.json): Full loop instructions and stop conditions.\n`;
  }
  llms += `\n## About\n\n- [About TEE-BOT](${origin}/about.md): Who builds, explains and checks the work.\n`;
  add('/llms.txt', llms, 'text/plain; charset=utf-8');
  const fullKinds = ['posts', 'prompts', 'loops', 'skills'] as const;
  add(
    '/llms-full.txt',
    '# AI POD Builder — full free resources\n\n' +
      fullKinds
        .flatMap((k) =>
          all[k].map(
            (e) =>
              `Source: ${origin}${entryPath(k, e)}\n\n${contentMarkdown(k, e, all)}`,
          ),
        )
        .join('\n\n---\n\n'),
    'text/plain; charset=utf-8',
  );
  const rssItems = [
    ...all.posts.map((e) => ({
      kind: 'posts' as const,
      entry: e,
      date: e.data.published,
    })),
    ...all.episodes.map((e) => ({
      kind: 'episodes' as const,
      entry: e,
      date: e.data.published,
    })),
  ]
    .sort((a, b) => +(b.date ?? 0) - +(a.date ?? 0))
    .map(({ kind, entry, date }) => {
      const url = origin + entryPath(kind, entry);
      const html = '<pre>' + xml(contentMarkdown(kind, entry, all)) + '</pre>';
      return `<item><title>${xml(entry.data.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid>${date ? `<pubDate>${date.toUTCString()}</pubDate>` : ''}<description>${xml(entry.data.title)}</description><content:encoded>${xml(html)}</content:encoded></item>`;
    })
    .join('');
  add(
    '/rss.xml',
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>AI POD Builder</title><link>${origin}/</link><description>Print-on-demand builds, free prompts and notes from TEE-BOT.</description><language>en-us</language><atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml"/>${rssItems}</channel></rss>`,
    'application/rss+xml; charset=utf-8',
  );
  add('/robots.txt', robotsText(), 'text/plain; charset=utf-8');
  return resources;
}
