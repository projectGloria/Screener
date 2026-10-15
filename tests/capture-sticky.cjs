// Run with Node, with playwright and sharp available through NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');

async function main() {
  const { positions } = await import('../geometry.js');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SCREENER_CHROMIUM_PATH });
  try {
    for (const nested of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 });
      const content = `<header>Normal-flow heading must survive later tiles</header>
        <section><figure style="position:sticky!important;top:24px!important;margin:0;align-self:start">
        <svg width="300" height="430" xmlns="http://www.w3.org/2000/svg">
        ${Array.from({ length: 10 }, (_, i) => `<rect y="${i * 43}" width="300" height="43" fill="hsl(${i * 36} 75% 45%)"/><text x="20" y="${i * 43 + 28}" font-size="24">Image band ${i}</text>`).join('')}
        </svg><figcaption>One complete illustration</figcaption></figure>
        <article>${Array.from({ length: 28 }, (_, i) => `<p>Content row ${i + 1}</p>`).join('')}</article></section>
        <div id="shadow"></div><footer>End of the page</footer>`;
      await page.setContent(`<!doctype html><style>
        *{box-sizing:border-box}body{margin:0;background:#202018;color:#ddd;font:20px sans-serif}
        header{height:120px;padding:30px}section{display:grid;grid-template-columns:340px 1fr;padding:24px;gap:30px}
        article p{height:58px;margin:0;border-bottom:1px solid #555}footer{height:170px;padding:30px}
        ${nested ? 'html,body{height:100%;overflow:hidden}#scroller{height:600px;overflow:auto;scroll-behavior:smooth}' : ''}
        </style>${nested ? `<main id="scroller">${content}</main>` : content}`);
      await page.evaluate(() => {
        document.querySelector('#shadow').attachShadow({ mode: 'open' }).innerHTML =
          '<div style="height:200px"><span style="position:sticky;top:10px">Shadow content</span></div>';
        globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener(fn) { globalThis.handleMessage = fn; } } } };
        globalThis.send = (action, extra = {}) => new Promise(resolve => handleMessage(
          { target: 'screener-page', action, ...extra }, { id: 'test' }, resolve));
      });
      await page.addScriptTag({ path: path.resolve(__dirname, '../content.js') });
      const originalStyle = await page.locator('figure').getAttribute('style');
      await page.evaluate(nested => (nested ? document.querySelector('#scroller') : window).scrollTo({ top: 190, behavior: 'instant' }), nested);
      const originalY = await page.evaluate(nested => nested ? document.querySelector('#scroller').scrollTop : scrollY, nested);
      const info = await page.evaluate(() => send('prepare', { frameOnly: true }));
      assert.ok(!info.error, info.error);
      assert.equal(await page.locator('figure').evaluate(el => getComputedStyle(el).position), 'relative');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#shadow').shadowRoot.querySelector('span')).position), 'relative');

      // Independently render the static document as the pixel reference.
      const expected = await page.evaluate(async nested => {
        await send('move', { x: 0, y: 0 });
        if (nested) {
          document.querySelector('#scroller').style.height = `${document.querySelector('#scroller').scrollHeight}px`;
          for (const el of [document.documentElement, document.body]) el.style.cssText = 'height:auto;overflow:visible';
        }
      }, nested).then(() => page.screenshot({ fullPage: true }));
      if (nested) await page.evaluate(() => {
        document.querySelector('#scroller').style.removeProperty('height');
        for (const el of [document.documentElement, document.body]) el.removeAttribute('style');
      });
      const overlap = Math.min(128, Math.floor((info.viewportHeight - 1) * .15));
      const tiles = [];
      let illustrationY;
      for (const [row, y] of positions(info.height, info.viewportHeight, overlap).entries()) {
        if (row === 1) await page.evaluate(() => send('hideOuterChrome'));
        const location = await page.evaluate(({ y, row }) => send('move', { x: 0, y, hideFixed: row > 0 }), { y, row });
        assert.ok(!location.error, location.error);
        assert.equal(location.y, y);
        const actualY = await page.locator('figure').evaluate(el => el.getBoundingClientRect().top);
        if (!row) illustrationY = actualY;
        assert.equal(actualY + y, illustrationY, 'Illustration must move with the document across every tile');
        assert.equal(await page.locator('header').evaluate(el => getComputedStyle(el).visibility), 'visible');
        const skip = row ? overlap : 0;
        const height = Math.min(info.viewportHeight - skip, info.height - y - skip);
        const shot = await page.screenshot();
        const dimensions = await sharp(shot).metadata();
        assert.ok(info.viewportWidth <= dimensions.width && skip + height <= dimensions.height,
          JSON.stringify({ info, dimensions, skip, height }));
        const input = await sharp(shot).extract({ left: 0, top: skip, width: info.viewportWidth, height }).toBuffer();
        tiles.push({ input, left: 0, top: y + skip });
      }
      const actual = await sharp({ create: { width: info.width, height: info.height, channels: 4, background: '#00000000' } }).composite(tiles).png().toBuffer();
      const expectedPixels = await sharp(expected).extract({ left: 0, top: 0, width: info.width, height: info.height }).ensureAlpha().raw().toBuffer();
      const actualPixels = await sharp(actual).ensureAlpha().raw().toBuffer();
      assert.equal(Buffer.compare(actualPixels, expectedPixels), 0, 'Stitched pixels must equal the static full-page reference');
      if (process.env.SCREENER_QA_DIR) {
        await fs.mkdir(process.env.SCREENER_QA_DIR, { recursive: true });
        await fs.writeFile(path.join(process.env.SCREENER_QA_DIR, `sticky-${nested ? 'nested' : 'document'}.png`), actual);
      }
      await page.evaluate(async () => { await send('restore'); await send('restoreOuterFixed'); });
      assert.equal(await page.locator('figure').getAttribute('style'), originalStyle);
      assert.equal(await page.locator('figure').evaluate(el => getComputedStyle(el).position), 'sticky');
      assert.equal(await page.evaluate(nested => nested ? document.querySelector('#scroller').scrollTop : scrollY, nested), originalY);
      await page.evaluate(async () => { await send('prepare', { frameOnly: true }); await send('cancel'); });
      assert.equal(await page.locator('figure').getAttribute('style'), originalStyle, 'Cancellation must restore inline CSS exactly');
      console.log(`PASS: ${nested ? 'nested scroller' : 'document'} pixels, shadow sticky content, normal headings, restoration and cancellation`);
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
