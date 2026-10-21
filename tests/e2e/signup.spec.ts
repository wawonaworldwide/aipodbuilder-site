import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
const script = `window.turnstile={render(element,options){this.callback=options.callback;element.textContent='Bot check test';setTimeout(()=>options.callback('XXXX.DUMMY.TOKEN.XXXX'),0);return 'fixture';},reset(){setTimeout(()=>this.callback('XXXX.DUMMY.TOKEN.XXXX'),0)}};`;
test.beforeEach(async ({ page }) => {
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js*',
    (route) =>
      route.fulfill({ contentType: 'application/javascript', body: script }),
  );
});
test('newsletter signup saves locally, keeps both opt-ins unchecked and works with the keyboard', async ({
  page,
}) => {
  await page.goto('/newsletter/?utm_source=phase4');
  await page.screenshot({
    path:
      'output/playwright/phase-4-newsletter-' +
      test.info().project.name +
      '.png',
    fullPage: true,
  });
  const form = page.locator('.email-capture');
  for (const checkbox of await form.getByRole('checkbox').all())
    await expect(checkbox).not.toBeChecked();
  const email = `phase4-weekly-${Date.now()}@example.test`;
  const emailField = form.getByLabel('Your email address');
  for (
    let step = 0;
    step < 60 &&
    !(await emailField.evaluate((el) => el === document.activeElement));
    step++
  )
    await page.keyboard.press('Tab');
  await expect(emailField).toBeFocused();
  await page.keyboard.type(email);
  await expect(form.getByRole('status')).toContainText('Bot check complete');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    form.getByLabel('Tell me when an app gets an update'),
  ).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+Tab');
  await expect(form.getByRole('button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form.getByRole('status')).toHaveText(
    'Saved locally. No email was sent.',
  );
  await expect(form.locator('fieldset')).toBeHidden();
  await expect
    .poll(() => {
      const path = '.local-tools/phase4/outbox/subscribers.jsonl';
      if (!existsSync(path)) return [];
      const row = readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((row) => row.email === email);
      return row?.tags?.sort() ?? [];
    })
    .toEqual(['app-updates', 'weekly-niches']);
});
test('product alerts do not opt into the weekly newsletter', async ({
  page,
}) => {
  await page.goto('/apps/ornament-bulk-creator/');
  const form = page.locator('.email-capture');
  const email = `phase4-app-${Date.now()}@example.test`;
  await form.getByLabel('Your email address').fill(email);
  await expect(form.getByRole('status')).toContainText('Bot check complete');
  await form.getByRole('button').click();
  await expect(form.getByRole('status')).toHaveText(
    'Saved locally. No email was sent.',
  );
  await expect
    .poll(() => {
      const path = '.local-tools/phase4/outbox/subscribers.jsonl';
      if (!existsSync(path)) return [];
      const row = readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((row) => row.email === email);
      return row?.tags ?? [];
    })
    .toEqual(['app-updates']);
});
test('server errors remain visible and the form can retry without losing the address', async ({
  page,
}) => {
  await page.goto('/newsletter/');
  const form = page.locator('.email-capture');
  await form
    .getByLabel('Your email address')
    .fill('retry-fixture@example.test');
  await expect(form.getByRole('status')).toContainText('Bot check complete');
  await page.route('**/api/subscribe', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        message: 'A few too many tries. Please wait ten minutes and try again.',
      }),
    }),
  );
  await form.getByRole('button').click();
  await expect(form.getByRole('status')).toContainText('wait ten minutes');
  await expect(form.getByLabel('Your email address')).not.toHaveValue('');
  await expect(form.getByRole('button')).toBeEnabled();
});
test('built Worker pages enforce the security policy without blocking the theme', async ({
  page,
  request,
}) => {
  const response = await request.get('http://localhost:8787/newsletter/');
  expect(response.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  await page.goto('http://localhost:8787/newsletter/');
  await page.getByRole('button', { name: 'Use light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const form = page.locator('.email-capture');
  await form.getByLabel('Your email address').focus();
  await expect(form.getByRole('status')).toContainText('Bot check complete');
});
