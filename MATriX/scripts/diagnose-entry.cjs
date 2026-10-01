const { chromium } = require('@playwright/test');
const { makePdf } = require('../tests/fixtures/pdf.cjs');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    page.on('pageerror', error => console.log('PAGE_ERROR', error.message));
    page.on('response', async res => {
      if (/\/api\/(games|chat|settings)$/.test(res.url())) {
        const text = await res.text().catch(() => '(stream interrupted)');
        console.log('API', res.status(), new URL(res.url()).pathname, text.slice(0, 550));
      }
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').setInputFiles({ name: 'regras-teste.pdf', mimeType: 'application/pdf', buffer: makePdf() });
    await page.getByRole('button', { name: /entrar na simulação/i }).click();
    await page.waitForTimeout(4500);
    console.log('VISIBLE', (await page.locator('body').innerText()).slice(-1400));
    console.log('CHAT_VISIBLE', await page.locator('textarea').isVisible());
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
