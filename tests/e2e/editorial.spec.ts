import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = JSON.parse(
  readFileSync('tests/fixtures/editorial/s01-source.json', 'utf8'),
);
test('S01 redirect, transcript and locked disclosure retain exact text', async ({
  page,
  request,
}) => {
  const redirect = await request.get('/free/s01', { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toBe(
    '/episodes/s01-day-with-my-pod-pipeline/#prompts',
  );
  await page.goto('/free/s01');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#prompts [data-copy-block]')).toHaveCount(3);
  const details = page
    .locator('details')
    .filter({ hasText: 'Read the draft transcript' });
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();
  expect(await details.locator('.transcript').textContent()).toBe(
    source.transcript,
  );
  expect(
    await (
      await request.get('/episodes/s01-day-with-my-pod-pipeline.md')
    ).text(),
  ).toContain(source.transcript);
  const locked = readFileSync(
    'tests/fixtures/editorial/meet-tee-bot.txt',
    'utf8',
  ).split('\n\n')[0];
  await page.goto('/blog/meet-tee-bot/');
  expect(await page.locator('main').textContent()).toContain(locked);
  expect(await (await request.get('/blog/meet-tee-bot.md')).text()).toContain(
    locked,
  );
});
test('conventional sitemap is valid XML with only public HTML routes', async ({
  page,
  request,
}) => {
  // Astro development uses the generated static sitemap from the preceding build.
  const xml = readFileSync('dist/sitemap.xml', 'utf8');
  await page.goto('/');
  const parsed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return {
      errors: doc.querySelectorAll('parsererror').length,
      locations: [...doc.querySelectorAll('loc')].map(
        (el) => el.textContent ?? '',
      ),
    };
  }, xml);
  expect(parsed.errors).toBe(0);
  expect(parsed.locations.length).toBeGreaterThan(0);
  for (const loc of parsed.locations) {
    const path = new URL(loc).pathname;
    expect(path).not.toMatch(/^\/(thanks|download|api|free)\//);
    expect(path).not.toBe('/newsletter/thanks/');
    expect(path).toMatch(/\/$/);
  }
  expect(await (await request.get('/robots.txt')).text()).toContain(
    '/sitemap.xml',
  );
});
