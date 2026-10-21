import { test, expect } from '@playwright/test';
test('video facade requests the privacy-enhanced player only after keyboard activation', async ({
  page,
}) => {
  let frames = 0;
  await page.route('https://www.youtube-nocookie.com/**', (route) => {
    frames++;
    return route.fulfill({
      contentType: 'text/html',
      body: '<title>Video fixture</title>',
    });
  });
  await page.route('**/episodes/e11-image-api-ranker/', async (route) => {
    const response = await route.fetch();
    // Supply a video ID only in this browser response; seed content remains unchanged.
    const body = (await response.text()).replace(
      /(<div\b[^>]*\bclass="video-facade"[^>]*)(>)/,
      (_, open, end) =>
        open.replace(/\sdata-video="[^"]*"/, '') +
        ' data-video="abcdefghijk"' +
        end +
        '<button type="button">Play video fixture</button>',
    );
    await route.fulfill({ response, body });
  });
  await page.goto('/episodes/e11-image-api-ranker/');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(frames).toBe(0);
  const play = page.getByRole('button', {
    name: 'Play video fixture',
    exact: true,
  });
  for (
    let step = 0;
    step < 60 && !(await play.evaluate((el) => el === document.activeElement));
    step++
  )
    await page.keyboard.press('Tab');
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1',
  );
  await expect.poll(() => frames).toBe(1);
});
test('private built pages keep noindex, no-store and no-referrer', async ({
  request,
}) => {
  for (const path of ['/thanks/', '/download/expired/', '/download/invalid']) {
    const response = await request.get('http://localhost:8787' + path);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
  }
});
