const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  // Exercise completion with downloads forbidden, independently of the preview.
  let saved = 0, opened = 0;
  const context = vm.createContext({
    setTimeout, crypto: require('node:crypto').webcrypto,
    saveCapture: async () => saved++,
    chrome: {
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      runtime: { onMessage: { addListener() {} }, getURL: value => value },
      tabs: { create: async () => opened++ },
      downloads: { download() { throw new Error('Automatic download attempted'); } }
    },
    canvas: { width: 600, height: 1600, convertToBlob: async () => new Blob(['capture']) }
  });
  vm.runInContext((await fs.readFile(path.join(root, 'background.js'), 'utf8')).replace(/^import .*;\r?\n/gm, ''), context);
  await vm.runInContext("finish(canvas, {title:'Test'}, 'Full page')", context);
  assert.equal(saved, 1); assert.equal(opened, 1);

  const server = http.createServer(async (req, res) => {
    try {
      const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SCREENER_CHROMIUM_PATH });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`);
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(600, 1600), ctx = canvas.getContext('2d');
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `hsl(${i * 45} 70% 55%)`; ctx.fillRect(0, i * 200, 600, 200);
        ctx.fillStyle = '#000'; ctx.font = '36px sans-serif'; ctx.fillText(`Screenshot section ${i + 1}`, 20, i * 200 + 100);
      }
      const { saveCapture } = await import('/database.js');
      await saveCapture({ id: 'export-test', blob: await canvas.convertToBlob(), title: 'Export test', mode: 'Full page', width: 600, height: 1600, created: Date.now() });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview.html?id=export-test`);
    await page.waitForFunction(() => !document.querySelector('#download').disabled);
    assert.equal(downloads, 0);
    const out = process.env.SCREENER_QA_DIR || path.join(require('node:os').tmpdir(), 'screener-export-qa');
    await fs.mkdir(out, { recursive: true });
    for (const format of ['png', 'jpg', 'webp', 'pdf']) {
      await page.selectOption('#format', format);
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
      assert.ok(download.suggestedFilename().endsWith(`.${format}`));
      const target = path.join(out, `screenshot.${format}`);
      await download.saveAs(target);
      const bytes = await fs.readFile(target);
      if (format === 'pdf') assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.4');
      else {
        const meta = await sharp(bytes).metadata();
        assert.equal(meta.format, format === 'jpg' ? 'jpeg' : format);
        assert.equal(meta.width, 600); assert.equal(meta.height, 1600);
      }
      assert.equal(await page.locator('#download').isEnabled(), true);
      console.log(`PASS: click-to-download ${format.toUpperCase()}`);
    }
    assert.equal(downloads, 4);
    // Conversion failure must leave a usable download button and an error.
    await page.evaluate(() => { globalThis.createImageBitmap = async () => { throw new Error('Test conversion failure'); }; });
    await page.click('#download');
    await page.waitForFunction(() => document.querySelector('#export-status').textContent.includes('Test conversion failure'));
    assert.equal(await page.locator('#download').isEnabled(), true);
    assert.equal(downloads, 4);
    console.log('PASS: no automatic download; export failure recovery');
    console.log(`QA files: ${out}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
