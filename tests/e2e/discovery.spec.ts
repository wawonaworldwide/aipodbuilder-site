import { test, expect } from '@playwright/test';
import { seedCollections } from '../fixtures/content';
import { extractPrompt } from '../../src/lib/markdown';
import { previewRoutes } from '../fixtures/routes';
test('all HTML pages expose parseable structured data and the right detail types', async ({
  request,
}) => {
  test.setTimeout(120000);
  for (const route of previewRoutes) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const graphs = [
      ...(await response.text()).matchAll(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ].map((match) => match[1]);
    const nodes = graphs.flatMap((s) => JSON.parse(s)['@graph']);
    const types = nodes.map((n) => n['@type']);
    for (const type of ['Organization', 'WebSite', 'BreadcrumbList'])
      expect(types, route).toContain(type);
    const org = nodes.find((n) => n['@type'] === 'Organization');
    expect(org.parentOrganization.name).toBe('Wawona Worldwide');
    if (route === '/blog/meet-tee-bot/')
      expect(types).toEqual(expect.arrayContaining(['BlogPosting', 'FAQPage']));
    if (/^\/loops\/[^/]+\/$/.test(route)) expect(types).toContain('HowTo');
    if (route === '/apps/ornament-bulk-creator/')
      expect(
        nodes.find((n) => n['@type'] === 'SoftwareApplication').offers,
      ).toMatchObject({
        '@type': 'Offer',
        price: '24.99',
        priceCurrency: 'USD',
      });
    if (route.startsWith('/episodes/'))
      expect(types).not.toContain('VideoObject');
  }
});
test('public discovery responses provide exact prompts, valid RSS, CORS and Markdown', async ({
  request,
  page,
}) => {
  const seeds = seedCollections();
  const response = await request.get('/api/prompts.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe(
    'application/json; charset=utf-8',
  );
  expect(response.headers()['access-control-allow-origin']).toBe('*');
  expect(response.headers()['cache-control']).toContain('max-age=300');
  const { prompts } = await response.json();
  expect(prompts).toHaveLength(6);
  const full = await (await request.get('/llms-full.txt')).text();
  const rss = await (await request.get('/rss.xml')).text();
  await page.goto('/');
  const parsed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const content = [
      ...doc.getElementsByTagNameNS(
        'http://purl.org/rss/1.0/modules/content/',
        'encoded',
      ),
    ].map(
      (e) =>
        new DOMParser().parseFromString(e.textContent ?? '', 'text/html').body
          .textContent,
    );
    return {
      errors: doc.querySelectorAll('parsererror').length,
      count: doc.querySelectorAll('item').length,
      content,
    };
  }, rss);
  expect(parsed.errors).toBe(0);
  expect(parsed.count).toBe(4);
  for (const entry of seeds.prompts) {
    const prompt = extractPrompt(entry.body!);
    expect(prompts.find((p: { id: string }) => p.id === entry.id).prompt).toBe(
      prompt,
    );
    expect(full).toContain(prompt);
    expect(parsed.content.join('\n')).toContain(prompt);
    const md = await request.get(`/prompts/${entry.id}.md`);
    expect(md.headers()['content-type']).toBe('text/markdown; charset=utf-8');
    expect(await md.text()).toContain(prompt);
    await page.goto(`/prompts/${entry.id}/`);
    await expect(
      page.locator('link[rel="alternate"][type="text/markdown"]'),
    ).toHaveAttribute('href', `/prompts/${entry.id}.md`);
  }
  const skills = await (await request.get('/api/skills.json')).json();
  expect(skills.count).toBe(0);
  for (const missing of [
    '/prompts/no-such-prompt.md',
    '/api/loops/no-such-loop.json',
    '/skills/no-such-skill.zip',
  ])
    expect((await request.get(missing)).status()).toBe(404);
});
test('loop discovery links agree and the library instruction is copyable', async ({
  page,
  request,
}) => {
  const feed = await (await request.get('/api/loops.json')).json();
  expect(feed.count).toBe(2);
  for (const loop of feed.loops) {
    expect(loop.status).toBe('draft');
    expect((await request.get(new URL(loop.url).pathname)).status()).toBe(200);
    expect(
      await (await request.get(`/api/loops/${loop.slug}.json`)).json(),
    ).toEqual(loop);
    expect(
      await (await request.get(new URL(loop.markdown_url).pathname)).text(),
    ).toContain(loop.loop_prompt);
  }
  const llms = await (await request.get('/llms.txt')).text();
  for (const match of llms.matchAll(
    /\]\((https:\/\/aipodbuilder\.com[^)]+)\)/g,
  ))
    expect((await request.get(new URL(match[1]).pathname)).status()).toBe(200);
  await page.goto('/loops/');
  await expect(
    page
      .locator('code')
      .filter({ hasText: 'Read https://aipodbuilder.com/api/loops.json' }),
  ).toBeVisible();
});

test('slashless content requests retain their canonical discovery metadata', async ({
  page,
}) => {
  await page.goto('/blog/meet-tee-bot');
  await expect(
    page.locator('link[rel="alternate"][type="text/markdown"]'),
  ).toHaveAttribute('href', '/blog/meet-tee-bot.md');
  const text = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(
    JSON.parse(text!)['@graph'].map((n: Record<string, unknown>) => n['@type']),
  ).toContain('BlogPosting');
});
