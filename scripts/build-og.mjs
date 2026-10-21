import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
const temp = resolve('.local-tools/browser-temp');
mkdirSync(temp, { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
const font = readFileSync(
  'node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-700-normal.woff2',
).toString('base64');
const body = readFileSync(
  'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
).toString('base64');
const bot = readFileSync('public/teebot/idle.svg').toString('base64');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(
    `<html><head><style>@font-face{font-family:Pixel;src:url(data:font/woff2;base64,${font})}@font-face{font-family:Inter;src:url(data:font/woff2;base64,${body})}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#16263f;color:#fdf0d5;display:flex;align-items:center;padding:64px;gap:40px}h1{font:700 72px/1.05 Pixel;margin:24px 0}p{font:24px/1.5 Inter;margin:0;color:#8aa0b8}.brand{font:700 32px Pixel;color:#2ec4b6}.words{width:720px}img{width:330px;height:330px}.line{height:8px;width:64px;background:#ff9f1c;margin-bottom:24px}</style></head><body><div class="words"><div class="line"></div><span class="brand">AI POD Builder</span><h1>Real builds.<br>Free prompts.<br>Your next small win.</h1><p>Codex builds. TEE-BOT explains.<br>The check is human.</p></div><img src="data:image/svg+xml;base64,${bot}" alt=""></body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'public/og-default.png.tmp', type: 'png' });
  renameSync('public/og-default.png.tmp', 'public/og-default.png');
} finally {
  await browser.close();
}
console.log('Default social preview image built locally (1200 x 630).');
