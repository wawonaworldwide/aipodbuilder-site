import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import matter from '../../scripts/frontmatter.mjs';
import { extractPrompt } from '../../src/lib/markdown';
import { previewRoutes } from '../fixtures/routes';

test('all page routes have unique metadata and valid internal links', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const links = new Set<string>();
  for (const route of previewRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('h1'), route).toHaveCount(1);
    const title = await page.title();
    expect(title.length, route).toBeLessThanOrEqual(60);
    expect(titles.has(title), route).toBe(false);
    titles.add(title);
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    expect(description, route).toBeTruthy();
    expect(description!.length, route).toBeLessThanOrEqual(160);
    expect(descriptions.has(description!), route).toBe(false);
    descriptions.add(description!);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://aipodbuilder.com${route}`,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://aipodbuilder.com/og-default.png',
    );
    await expect(page.locator('meta[name="twitter:site"]')).toHaveAttribute(
      'content',
      '@AIPODBuilder',
    );
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-labelledby]')].flatMap((e) =>
        (e.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .filter((id) => !document.getElementById(id)),
      ),
    );
    expect(missing, route).toEqual([]);
    for (const href of await page
      .locator('a[href]')
      .evaluateAll((anchors) =>
        anchors.map((a) => (a as HTMLAnchorElement).href),
      )) {
      const url = new URL(href);
      if (url.hostname === 'localhost')
        links.add(url.pathname + url.search + url.hash);
    }
  }
  for (const link of links) {
    const url = new URL(link, 'http://localhost:4321');
    const response = await request.get(url.pathname + url.search);
    expect(response.status(), link).toBe(200);
    if (url.hash) {
      const html = await response.text();
      expect(html, link).toContain(
        `id="${decodeURIComponent(url.hash.slice(1))}"`,
      );
    }
  }
  const image = await request.get('/og-default.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('copies every prompt and loop exactly on its real page', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text: string) => {
      (window as unknown as { copiedSource: string }).copiedSource = text;
      return original(text);
    };
  });
  const cases = [
    ...[
      's01-01-pipeline-map',
      's01-02-research-inbox',
      's01-03-approval-desk',
      'e11-01-opening',
      'e17-01-opening',
      'e17-02-level-2',
    ].map((id) => ({
      id,
      route: `/prompts/${id}/`,
      loop: false,
    })),
    ...['listing-seo-loop', 'design-qa-loop'].map((id) => ({
      id,
      route: `/loops/${id}/`,
      loop: true,
    })),
    { id: 'e11-01-opening', route: '/blog/meet-tee-bot/', loop: false },
  ];
  for (const item of cases) {
    const entry = matter(
      readFileSync(
        `src/content/${item.loop ? 'loops' : 'prompts'}/${item.id}.md`,
        'utf8',
      ),
    );
    const expected = item.loop
      ? entry.data.loop_prompt
      : extractPrompt(entry.content);
    await page.goto(item.route);
    const article = page.locator(`[data-seed-id="${item.id}"]`);
    expect(await article.locator('code').textContent()).toBe(expected);
    await article.getByRole('button', { name: /^Copy prompt:/ }).click();
    await expect(article.getByRole('status')).toHaveText('Copied!');
    expect(
      await page.evaluate(
        () => (window as unknown as { copiedSource: string }).copiedSource,
      ),
    ).toBe(expected);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      process.platform === 'win32' ? expected.replace(/\n/g, '\r\n') : expected,
    );
    const wrap = article.getByRole('button', { name: /^Wrap prompt:/ });
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await expect(article.locator('pre')).toHaveCSS('white-space', 'pre-wrap');
  }
  await page.goto('/loops/');
  const expected = matter(
    readFileSync('src/content/loops/listing-seo-loop.md', 'utf8'),
  ).data.loop_prompt;
  await page
    .getByRole('button', {
      name: 'Copy loop: The listing SEO loop',
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedSource: string }).copiedSource,
    ),
  ).toBe(expected);
});

test('filters work, can be cleared, and restore from the address', async ({
  page,
}) => {
  await page.goto('/prompts/');
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(6);
  await page.getByLabel('Episode', { exact: true }).selectOption('e11');
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('Episode', { exact: true })).toHaveValue('e11');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Tag', { exact: true }).selectOption('ornaments');
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(2);
  await page.getByLabel('Search tags or keywords').fill('nothing-matches-this');
  await expect(page.locator('[data-no-results]')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(6);
  await page.goto('/episodes/?stage=research');
  await expect(page.locator('[data-no-results]')).toBeVisible();
  await page.getByLabel('Pipeline stage').selectOption('designs');
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(1);
  await page.goto('/loops/');
  await page.getByRole('button', { name: 'Listings', exact: true }).click();
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue(
    'listings',
  );
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Search tags or keywords').fill('dpi');
  await expect(page.locator('[data-filter-item]:visible')).toHaveCount(1);
});

test('desktop and mobile pages pass accessibility in both themes', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  mkdirSync('output/playwright', { recursive: true });
  for (const route of [
    '/',
    '/episodes/e11-image-api-ranker/',
    '/episodes/s01-day-with-my-pod-pipeline/',
    '/blog/meet-tee-bot/',
    '/loops/listing-seo-loop/',
    '/apps/ornament-bulk-creator/',
    '/newsletter/',
    '/thanks/',
    '/download/expired/',
  ]) {
    await page.goto(route);
    for (const theme of ['dark', 'light']) {
      const current = await page.locator('html').getAttribute('data-theme');
      if (current !== theme)
        await page.getByRole('button', { name: `Use ${theme} mode` }).click();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        result.violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact ?? ''),
        ),
        `${route} ${theme}`,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        route,
      ).toBe(true);
      if (route === '/' || route === '/apps/ornament-bulk-creator/') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `output/playwright/phase-2-${testInfo.project.name}-${theme}-${route === '/' ? 'home' : 'app'}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.teebot.bob')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('episode prompts stay visible without JavaScript or signup', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://localhost:4321/episodes/e17-ornament-bulk-creator/');
  await expect(page.locator('#prompts [data-copy-block]')).toHaveCount(2);
  await expect(
    page.locator('[data-seed-id="e17-02-level-2"] code'),
  ).toContainText('Level 2 for the ornament creator');
  await context.close();
});

test('short links redirect, unknown pages are friendly, and the store stays in test mode', async ({
  request,
  page,
}) => {
  const redirect = await request.get('/free/11', { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toBe(
    '/episodes/e11-image-api-ranker/#prompts',
  );
  const missing = await page.goto('/free/99');
  expect(missing?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(
    'This page wandered off the workbench.',
  );
  await page.goto('/apps/ornament-bulk-creator/');
  await expect(page.locator('.price strong')).toHaveText('$24.99 + tax');
  await expect(
    page.getByRole('button', { name: /Buy — test checkout/ }),
  ).toBeEnabled();
  await expect(page.getByText('TEST MODE: no real charges')).toBeVisible();
  await page.goto('/newsletter/');
  await expect(page.getByLabel('Your email address')).toBeEnabled();
  for (const checkbox of await page.getByRole('checkbox').all())
    await expect(checkbox).not.toBeChecked();
  await page.goto('/thanks/?session_id=recording-safe-example');
  await expect(page.locator('body')).not.toContainText(
    'recording-safe-example',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
});
