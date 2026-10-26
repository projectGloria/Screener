const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function renderAssets() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SCREENER_CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  // Ensure assets dir exists
  if (!fs.existsSync('assets')) {
    fs.mkdirSync('assets', { recursive: true });
  }

  // 1. Popup screenshot
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 380 }, deviceScaleFactor: 2 });
    await page.goto('file:///' + path.resolve('popup.html').replace(/\\/g, '/'));
    await page.evaluate(() => {
      document.body.style.margin = '24px auto';
      document.body.style.boxShadow = '0 16px 48px rgba(0, 0, 0, 0.75), 0 0 0 1px #303039';
      document.body.style.border = '1px solid #303039';
      document.body.style.borderRadius = '16px';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.background = '#0a0a0e';
      document.documentElement.style.display = 'flex';
      document.documentElement.style.justifyContent = 'center';
      document.documentElement.style.alignItems = 'center';
      document.documentElement.style.height = '100vh';
      const ver = document.getElementById('version');
      if (ver) ver.textContent = 'v1.2.0';
    });
    await page.screenshot({ path: 'assets/popup-interface.png' });
    console.log('Generated assets/popup-interface.png');
  }

  // 2. Preview Hero screenshot
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 2 });
    await page.goto('file:///' + path.resolve('preview.html').replace(/\\/g, '/'));
    await page.evaluate(() => {
      document.getElementById('title').textContent = 'Project Gloria — Documentation & Architecture';
      document.getElementById('details').textContent = '1920 × 4850 px · Captured just now';
      const img = document.getElementById('image');
      img.hidden = false;

      // Realistic mockup inside preview window
      const svg = `
      <svg width="960" height="580" viewBox="0 0 960 580" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="960" height="580" rx="8" fill="#181922" stroke="#2d2b38"/>
        <!-- Browser Bar -->
        <rect width="960" height="48" rx="8" fill="#20212c"/>
        <circle cx="28" cy="24" r="6" fill="#ff5f56"/>
        <circle cx="48" cy="24" r="6" fill="#ffbd2e"/>
        <circle cx="68" cy="24" r="6" fill="#27c93f"/>
        <rect x="96" y="12" width="420" height="24" rx="6" fill="#2a2c3a"/>
        <text x="114" y="28" fill="#9d9ba8" font-family="-apple-system, sans-serif" font-size="12">https://projectgloria.github.io/kintsugi</text>
        <!-- Header -->
        <rect x="60" y="85" width="280" height="28" rx="5" fill="#b8a8ff"/>
        <rect x="60" y="125" width="560" height="14" rx="4" fill="#69657b"/>
        <rect x="60" y="149" width="440" height="14" rx="4" fill="#4d4a5c"/>
        <!-- Feature Cards -->
        <rect x="60" y="195" width="260" height="170" rx="10" fill="#22232f" stroke="#363445"/>
        <rect x="85" y="220" width="120" height="16" rx="4" fill="#9dceae"/>
        <rect x="85" y="250" width="210" height="10" rx="3" fill="#58546b"/>
        <rect x="85" y="270" width="180" height="10" rx="3" fill="#58546b"/>
        <rect x="85" y="290" width="150" height="10" rx="3" fill="#58546b"/>
        <rect x="85" y="325" width="100" height="22" rx="6" fill="#b8a8ff" fill-opacity="0.2"/>

        <rect x="350" y="195" width="260" height="170" rx="10" fill="#22232f" stroke="#363445"/>
        <rect x="375" y="220" width="140" height="16" rx="4" fill="#b8a8ff"/>
        <rect x="375" y="250" width="210" height="10" rx="3" fill="#58546b"/>
        <rect x="375" y="270" width="190" height="10" rx="3" fill="#58546b"/>
        <rect x="375" y="290" width="160" height="10" rx="3" fill="#58546b"/>
        <rect x="375" y="325" width="100" height="22" rx="6" fill="#b8a8ff" fill-opacity="0.2"/>

        <rect x="640" y="195" width="260" height="170" rx="10" fill="#22232f" stroke="#363445"/>
        <rect x="665" y="220" width="110" height="16" rx="4" fill="#ffbd2e"/>
        <rect x="665" y="250" width="210" height="10" rx="3" fill="#58546b"/>
        <rect x="665" y="270" width="170" height="10" rx="3" fill="#58546b"/>
        <rect x="665" y="290" width="140" height="10" rx="3" fill="#58546b"/>
        <rect x="665" y="325" width="100" height="22" rx="6" fill="#b8a8ff" fill-opacity="0.2"/>

        <!-- Content stream below -->
        <rect x="60" y="395" width="840" height="150" rx="10" fill="#1e1f29" stroke="#302e3f"/>
        <rect x="85" y="420" width="190" height="18" rx="4" fill="#cfc7f8"/>
        <rect x="85" y="450" width="600" height="12" rx="3" fill="#5b5770"/>
        <rect x="85" y="472" width="520" height="12" rx="3" fill="#5b5770"/>
        <rect x="85" y="494" width="450" height="12" rx="3" fill="#5b5770"/>
      </svg>`;

      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

      // enable buttons
      ['zoom', 'copy', 'format', 'download'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.removeAttribute('disabled');
      });
    });
    await page.screenshot({ path: 'assets/preview-hero.png' });
    console.log('Generated assets/preview-hero.png');
  }

  // 3. Workflow Banner
  {
    const page = await browser.newPage({ viewport: { width: 920, height: 260 }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          margin: 0;
          padding: 24px 20px;
          background: #111217;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #efedf7;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          width: 100%;
          max-width: 880px;
        }
        .step {
          background: #1b1c24;
          border: 1px solid #2f2d3b;
          border-radius: 12px;
          padding: 24px 18px 20px;
          text-align: center;
          position: relative;
        }
        .step-num {
          position: absolute;
          top: -10px;
          left: 18px;
          background: #b8a8ff;
          color: #1d153a;
          font-weight: 800;
          font-size: 11px;
          padding: 2px 9px;
          border-radius: 10px;
          letter-spacing: 0.5px;
        }
        .step-icon {
          font-size: 28px;
          margin-bottom: 12px;
          display: block;
        }
        .step-title {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 6px;
          color: #f3f1fb;
        }
        .step-desc {
          font-size: 11px;
          color: #9894a8;
          line-height: 1.45;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="step">
          <span class="step-num">STEP 1</span>
          <span class="step-icon">⚡</span>
          <div class="step-title">Trigger Capture</div>
          <div class="step-desc">One click on the extension popup begins the smart page scan.</div>
        </div>
        <div class="step">
          <span class="step-num">STEP 2</span>
          <span class="step-icon">📐</span>
          <div class="step-title">Seamless Tiling</div>
          <div class="step-desc">Smooth automated scrolling with sticky-header preservation.</div>
        </div>
        <div class="step">
          <span class="step-num">STEP 3</span>
          <span class="step-icon">🔒</span>
          <div class="step-title">Local IndexedDB</div>
          <div class="step-desc">Stitched lossless canvas saved only on your machine. Zero cloud.</div>
        </div>
        <div class="step">
          <span class="step-num">STEP 4</span>
          <span class="step-icon">💾</span>
          <div class="step-title">Export &amp; Share</div>
          <div class="step-desc">Instant export to PNG, JPG, WebP, or single-sheet scaled PDF.</div>
        </div>
      </div>
    </body>
    </html>`);
    await page.screenshot({ path: 'assets/workflow.png' });
    console.log('Generated assets/workflow.png');
  }

  await browser.close();
}

renderAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
