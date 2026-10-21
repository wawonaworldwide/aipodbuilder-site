import { describe, expect, it } from 'vitest';
import {
  createDiscovery,
  contentMarkdown,
  robotsText,
  type Resource,
} from '../../src/lib/discovery';
import { safeJson, structuredData } from '../../src/lib/jsonld';
import { seedCollections } from '../fixtures/content';
import { siteDisclosure } from '../../src/lib/site-editorial';
import { extractPrompt } from '../../src/lib/markdown';
const json = (r: Resource | undefined) => JSON.parse(r?.body as string);
describe('agent discovery', () => {
  it('exposes only standalone starters while keeping draft routes hidden in production', () => {
    const resources = createDiscovery(seedCollections(), { drafts: false });
    expect(json(resources.get('/api/loops.json')).loops).toEqual([]);
    expect(json(resources.get('/api/prompts.json')).count).toBe(3);
    expect(
      resources.get('/episodes/s01-day-with-my-pod-pipeline.md'),
    ).toBeUndefined();
    expect(resources.get('/prompts/s01-01-pipeline-map.md')).toBeUndefined();
    expect(json(resources.get('/api/skills.json')).skills).toEqual([]);
    for (const path of resources.keys())
      expect(path).not.toMatch(/e11|e17|listing-seo|ornament-bulk/);
    expect(resources.get('/llms-full.txt')?.body).not.toContain('Level 2');
  });

  it('includes exact standalone texts and working URLs with MIT licensing without changing drafts', () => {
    const all = seedCollections();
    const before = JSON.stringify(all);
    const resources = createDiscovery(all, { drafts: false });
    const feed = json(resources.get('/api/prompts.json'));
    expect(feed.license).toBe('MIT');
    expect(json(resources.get('/api/loops.json')).license).toBe('MIT');
    const starters = all.prompts.filter((p) => p.id.startsWith('s01-'));
    expect(feed.count).toBe(3);
    starters
      .sort((a, b) => a.data.order - b.data.order)
      .forEach((entry, index) => {
        const prompt = feed.prompts.find(
          (p: { id: string }) => p.id === entry.id,
        );
        expect(prompt.prompt).toBe(extractPrompt(entry.body!));
        expect(prompt.status).toBe('draft');
        expect(prompt.url).toBe(
          'https://aipodbuilder.com/free/s01/#starter-' + (index + 1),
        );
        expect(prompt.markdown_url).toBe(
          'https://aipodbuilder.com/free/s01.md',
        );
        expect(resources.get('/llms-full.txt')?.body).toContain(prompt.prompt);
        expect(resources.get('/free/s01.md')?.body).toContain(prompt.prompt);
      });
    expect(JSON.stringify(all)).toBe(before);
  });
  it('omits empty discovery headings and preview wording while listing all starter anchors', () => {
    const resources = createDiscovery(seedCollections(), { drafts: false });
    const text = resources.get('/llms.txt')?.body as string;
    expect(text).not.toContain('Draft entries in a preview');
    expect(text).toContain('](https://aipodbuilder.com/free/s01/)');
    for (const n of [1, 2, 3])
      expect(text).toContain('/free/s01/#starter-' + n);
    expect(text).not.toContain('/episodes/s01');
  });
  it('uses the locked disclosure in About Markdown without publishing the blog post', () => {
    const resources = createDiscovery(seedCollections(), { drafts: false });
    expect(resources.get('/about.md')?.body).toContain(siteDisclosure);
    expect(resources.get('/about.md')?.body).toContain('The check is human.');
    expect(resources.get('/blog/meet-tee-bot.md')).toBeUndefined();
  });
  it('keeps all exact prompts in preview feeds, twins and full text', () => {
    const all = seedCollections();
    const resources = createDiscovery(all, { drafts: true });
    const prompts = json(resources.get('/api/prompts.json')).prompts;
    expect(prompts).toHaveLength(6);
    for (const entry of all.prompts) {
      const expected = extractPrompt(entry.body!);
      expect(
        prompts.find((p: { id: string }) => p.id === entry.id).prompt,
      ).toBe(expected);
      expect(resources.get(`/prompts/${entry.id}.md`)?.body).toContain(
        expected,
      );
      expect(resources.get('/llms-full.txt')?.body).toContain(expected);
      const episode = all.episodes.find(
        (e) => e.data.id === entry.data.episode,
      )!;
      expect(
        resources.get(`/episodes/${episode.data.slug}.md`)?.body,
      ).toContain(expected);
    }
  });
  it('publishes only tested loops outside preview, including full fields and per-loop JSON', () => {
    const all = seedCollections();
    const loop = all.loops[0];
    loop.data.status = 'tested';
    loop.data.date_tested = new Date('2026-10-19');
    loop.data.result = 'Test fixture only';
    const retired = structuredClone(loop);
    retired.id = 'retired-loop';
    retired.data.slug = 'retired-loop';
    retired.data.status = 'retired';
    all.loops.push(retired);
    const resources = createDiscovery(all, { drafts: false, license: 'MIT' });
    const feed = json(resources.get('/api/loops.json'));
    expect(feed.count).toBe(1);
    expect(feed.license).toBe('MIT');
    expect(feed.inspired_by.author).toBe('Forward Future');
    expect(feed.loops[0]).toMatchObject({
      slug: loop.data.slug,
      status: 'tested',
      loop_prompt: loop.data.loop_prompt,
      category: { label: loop.data.category },
      success_check: loop.data.success_check,
      stop_conditions: loop.data.stop_conditions,
      approval_boundaries: loop.data.approval_boundaries,
    });
    expect(json(resources.get(`/api/loops/${loop.data.slug}.json`))).toEqual(
      feed.loops[0],
    );
    expect(resources.get('/api/loops/retired-loop.json')).toBeUndefined();
    expect(
      createDiscovery(all, { drafts: true }).get(
        '/api/loops/retired-loop.json',
      ),
    ).toBeUndefined();
  });
  it('includes every published prompt in the full feed even if its episode is a draft', () => {
    const all = seedCollections();
    all.prompts.forEach((p) => {
      p.data.status = 'tested';
      p.data.result = 'worked';
      p.data.date_tested = new Date('2026-10-19');
    });
    const resources = createDiscovery(all, { drafts: false });
    expect(json(resources.get('/api/prompts.json')).count).toBe(6);
    all.prompts.forEach((p) =>
      expect(resources.get('/llms-full.txt')?.body).toContain(
        extractPrompt(p.body!),
      ),
    );
  });
  it('labels preview drafts, preserves loop text and omits storage paths', () => {
    const all = seedCollections();
    const resources = createDiscovery(all, { drafts: true });
    expect(
      json(resources.get('/api/loops.json')).loops.every(
        (l: { status: string }) => l.status === 'draft',
      ),
    ).toBe(true);
    expect(resources.get('/llms.txt')?.body).toContain('(draft)');
    expect(contentMarkdown('loops', all.loops[0], all)).toContain(
      all.loops[0].data.loop_prompt,
    );
    expect(contentMarkdown('products', all.products[0], all)).not.toContain(
      all.products[0].data.r2_key,
    );
    expect(resources.get('/rss.xml')?.body).not.toContain('<pubDate>Invalid');
  });
  it('keeps the required llms heading order and crawler exceptions', () => {
    const text = createDiscovery(seedCollections(), { drafts: false }).get(
      '/llms.txt',
    )?.body as string;
    expect(text.match(/^## .+$/gm)).toEqual(['## Free prompts', '## About']);
    for (const group of robotsText()
      .split('\n\n')
      .filter((g) => g.startsWith('User-agent:'))) {
      expect(group).toContain('Disallow: /api/');
      expect(group).toContain('Allow: /api/prompts.json');
      expect(group).toContain('Disallow: /download/');
    }
  });
});
describe('structured data', () => {
  const all = seedCollections();
  const graph = (path: string) =>
    structuredData(path, 'Test page', 'Test description', all)[
      '@graph'
    ] as Record<string, unknown>[];
  it('adds the right page types without inventing videos for unrecorded episodes', () => {
    const types = (path: string) => graph(path).map((g) => g['@type']);
    expect(types('/')).toEqual(['Organization', 'WebSite', 'BreadcrumbList']);
    expect(types('/blog/meet-tee-bot/')).toContain('BlogPosting');
    expect(types('/blog/meet-tee-bot/')).toContain('FAQPage');
    expect(types('/loops/design-qa-loop/')).toContain('HowTo');
    expect(types('/episodes/e11-image-api-ranker/')).not.toContain(
      'VideoObject',
    );
    const product = graph('/apps/ornament-bulk-creator/').find(
      (g) => g['@type'] === 'SoftwareApplication',
    );
    expect(product?.offers).toMatchObject({
      '@type': 'Offer',
      price: '24.99',
      priceCurrency: 'USD',
    });
  });
  it('includes VideoObject only when an actual video ID is configured', () => {
    const fixture = seedCollections();
    fixture.episodes[0].data.youtube_id = 'testvideo01';
    fixture.episodes[0].data.published = new Date('2026-10-19');
    expect(
      JSON.stringify(
        structuredData(
          '/episodes/e11-image-api-ranker/',
          'Episode',
          'Description',
          fixture,
        ),
      ),
    ).toContain('VideoObject');
  });
  it('escapes script termination and round-trips the original text', () => {
    const value = { text: '</script><script>example</script>\u2028' };
    const serialized = safeJson(value);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(value);
  });
});
