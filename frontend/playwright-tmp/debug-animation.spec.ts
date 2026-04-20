import { test } from 'playwright/test';

test('debug animation page', async ({ page }) => {
  page.on('console', (msg) => {
    console.log('BROWSER_CONSOLE', msg.type(), msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('BROWSER_PAGEERROR', err.message);
  });

  await page.goto('http://localhost:3000/debug/animation-runtime?fresh=8', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const html = await page.content();
  console.log('HAS_LEGACY_SHELL', html.includes('animation-runtime-legacy-shell'));
  console.log('HAS_TRACK', html.includes('animation-runtime-track'));

  await page.screenshot({ path: '/tmp/spectra-bubble-main-debug-spec.png', fullPage: true });
});
