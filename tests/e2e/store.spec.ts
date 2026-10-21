import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
const fixture = 'cs_test_browser_fixture';
test('Buy works from the keyboard and follows the mocked checkout redirect', async ({
  page,
}) => {
  let selected = '';
  await page.route('**/api/checkout', (route) => {
    selected =
      new URLSearchParams(route.request().postData() || '').get('slug') || '';
    return route.fulfill({
      status: 303,
      headers: {
        Location: 'http://localhost:4321/?checkout-fixture=true',
      },
    });
  });
  await page.goto('/apps/ornament-bulk-creator/');
  const button = page.getByRole('button', { name: 'Buy — test checkout' });
  for (
    let step = 0;
    step < 50 &&
    !(await button.evaluate((el) => el === document.activeElement));
    step++
  )
    await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  // Worker tests verify the Stripe destination; this browser redirect stays local.
  await expect(page).toHaveURL('http://localhost:4321/?checkout-fixture=true');
  expect(selected).toBe('ornament-bulk-creator');
});
test('thank-you page confirms, hides the session reference, downloads a ZIP and saves opt-in', async ({
  page,
}) => {
  const capability = 'x'.repeat(43);
  let polls = 0;
  let consent = false;
  await page.route('**/api/order-status?*', (route) =>
    route.fulfill({
      json:
        ++polls === 1
          ? { state: 'processing' }
          : {
              state: 'ready',
              product: 'Ornament Bulk Creator',
              maskedEmail: 'b***@example.test',
              downloadUrl: 'http://localhost:4321/download/' + capability,
            },
    }),
  );
  await page.route('**/download/' + capability, (route) =>
    route.fulfill({
      body: Buffer.from(
        zipSync({
          'README.md': strToU8(
            'PLACEHOLDER: this is a test download, not the real app',
          ),
        }),
      ),
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition':
          'attachment; filename="ornament-bulk-creator-1.0.0.zip"',
      },
    }),
  );
  await page.route('**/api/order-updates', (route) => {
    const body = route.request().postDataJSON();
    consent =
      body.app_updates === true &&
      body.session_id === fixture &&
      !('slug' in body);
    return route.fulfill({
      json: {
        ok: true,
        message: 'Preference saved locally. No email was sent.',
      },
    });
  });
  await page.goto('/thanks/?session_id=' + fixture);
  await expect(page).toHaveURL(/\/thanks\/$/);
  await expect(page.locator('body')).not.toContainText(fixture);
  await expect(page.locator('h1')).toHaveText('You own it now. Small win!');
  await expect(page.locator('[data-owner-form] input')).not.toBeChecked();
  await page.screenshot({
    path:
      'output/playwright/phase-5-thanks-' + test.info().project.name + '.png',
    fullPage: true,
  });
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download your app', exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('ornament-bulk-creator-1.0.0.zip');
  await page
    .getByLabel('Email me when this app gets an update', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Save my app update choice' }).click();
  expect(consent).toBe(true);
  await expect(page.locator('[data-owner-form] [role=status]')).toContainText(
    'saved locally',
  );
  await expect(page.locator('body')).not.toContainText(capability);
});
test('unpaid orders show recovery without a download button', async ({
  page,
}) => {
  await page.route('**/api/order-status?*', (route) =>
    route.fulfill({ json: { state: 'not_paid' } }),
  );
  await page.goto('/thanks/?session_id=' + fixture);
  await expect(page.locator('[data-order-status]')).toContainText(
    'could not confirm',
  );
  await expect(
    page.getByRole('button', { name: 'Download your app', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('link', { name: 'Need a fresh download link?' }),
  ).toBeVisible();
});
test('recovery form gives the same private acknowledgement', async ({
  page,
}) => {
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js*',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: "window.turnstile={render(element,options){setTimeout(()=>options.callback('XXXX.DUMMY.TOKEN.XXXX'),0);return 'fixture';},reset(){}};",
      }),
  );
  await page.route('**/api/resend-download', (route) =>
    route.fulfill({
      json: {
        ok: true,
        message: 'If that email bought something, a fresh link is on its way.',
      },
    }),
  );
  await page.goto('/download/expired/');
  await page.getByLabel('Your purchase email').fill('recovery@example.test');
  await expect(page.getByRole('status')).toContainText('Bot check complete');
  await page.getByRole('button', { name: 'Send a fresh link' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'If that email bought something, a fresh link is on its way.',
  );
  await expect(page.locator('fieldset')).toBeHidden();
});
