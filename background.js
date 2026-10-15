import { positions, validateSize } from './geometry.js';
import { saveCapture } from './database.js';

let job = null;
let status = { busy: false, message: 'Ready when you are.' };
let lastCapture = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = (tabId, action, extra = {}, frameId) => chrome.tabs.sendMessage(tabId, { target: 'screener-page', action, ...extra }, frameId === undefined ? {} : { frameId });

function update(message, busy = true) {
  status = { busy, message };
  chrome.action.setBadgeText({ text: busy ? '…' : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#7262e8' }).catch(() => {});
}

async function assertActive(tab) {
  if (job?.cancelled) throw new Error('Capture cancelled.');
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== tab.id) throw new Error('Capture stopped because you switched tabs. Return to the page and try again.');
}

async function screenshot(tab) {
  await sleep(Math.max(0, 600 - (Date.now() - lastCapture)));
  await assertActive(tab);
  lastCapture = Date.now();
  const data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await assertActive(tab);
  return createImageBitmap(await (await fetch(data)).blob());
}

async function finish(canvas, tab, mode) {
  update('Preparing your preview…');
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const id = crypto.randomUUID();
  await saveCapture({ id, blob, title: tab.title || 'Screenshot', width: canvas.width, height: canvas.height, mode, created: Date.now() });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`preview.html?id=${id}`) });
  update('Screenshot ready. Saved in your local preview.', false);
}

function normalizeFrameInfo(info, frameId, topInfo, frameMap) {
  if (!info) return info;
  info.screenInnerWidth = topInfo?.innerWidth || info.screenInnerWidth || info.innerWidth;
  info.screenInnerHeight = topInfo?.innerHeight || info.screenInnerHeight || info.innerHeight;
  if (frameId === 0) return info;
  const normalizeUrl = value => {
    if (!value) return '';
    try {
      const url = new URL(value);
      url.hash = '';
      return url.href.replace(/\/$/, '');
    } catch { return String(value).split('#')[0].replace(/\/$/, ''); }
  };
  const frameUrl = normalizeUrl(info.frameUrl);
  const matches = frameMap?.filter(item => {
    const href = normalizeUrl(item.href);
    const src = normalizeUrl(item.src || item.rawSrc);
    return (href && href === frameUrl) || (src && src === frameUrl);
  }) || [];
  const frame = matches[0] || (frameMap?.length === 1 ? frameMap[0] : null);
  if (!frame) return info;
  if (info.captureRect && !info.frameKnown) {
    info.captureRect = { x: frame.rect.x + info.captureRect.x, y: frame.rect.y + info.captureRect.y, width: info.captureRect.width, height: info.captureRect.height };
  } else if (!info.captureRect) info.captureRect = frame.rect;
  return info;
}

async function selectCaptureFrame(tab, frameIds) {
  const ids = [...new Set(frameIds?.length ? frameIds : [0])];
  const topInfo = await page(tab.id, 'measure', { frameOnly: true }, 0).catch(() => null);
  const frameMap = await page(tab.id, 'frameMap', {}, 0).catch(() => []);
  const measured = [];
  for (const frameId of ids) {
    try {
      const info = normalizeFrameInfo(await page(tab.id, 'measure', { frameOnly: true }, frameId), frameId, topInfo, frameMap);
      if (info) measured.push({ frameId, info, topInfo, frameMap });
    } catch { /* A protected frame is skipped; the outer page remains capturable. */ }
  }
  if (!measured.length) return { frameId: 0, topInfo, frameMap };
  const score = ({ info }) => Math.max(info.width / Math.max(1, info.viewportWidth), info.height / Math.max(1, info.viewportHeight));
  return measured.sort((a, b) => score(b) - score(a) || b.info.height - a.info.height)[0];
}

async function captureFull(tab, frameMeta = { frameId: 0 }) {
  const frameId = frameMeta.frameId ?? 0;
  let prepared = false;
  let outerHidden = false;
  let canvas;
  try {
    prepared = true;
    // Frame selection has already happened above. Prepare exactly that frame;
    // letting the top document auto-select an iframe here can create a second,
    // nested capture session with the wrong scroll coordinates.
    const info = normalizeFrameInfo(await page(tab.id, 'prepare', { frameOnly: true }, frameId), frameId, frameMeta.topInfo, frameMeta.frameMap);
    if (info.error) throw new Error(info.error);
    validateSize(Math.ceil(info.width * info.dpr), Math.ceil(info.height * info.dpr));
    const xs = positions(info.width, info.viewportWidth);
    const verticalOverlap = Math.min(128, Math.max(0, Math.floor((info.viewportHeight - 1) * .15)));
    const ys = positions(info.height, info.viewportHeight, verticalOverlap);
    const total = xs.length * ys.length;
    if (total > 100) throw new Error('This page needs too many captures. Zoom out or select a smaller area.');
    let index = 0;
    let scaleX, scaleY;
    for (const [row, y] of ys.entries()) for (const [column, x] of xs.entries()) {
      await assertActive(tab);
      update(`Capturing page · ${++index} of ${total}`);
      // Keep the first vertical row intact. Hide top-level viewer chrome when
      // entering the second vertical row, regardless of whether the page was
      // exposed as an iframe or as a nested scrolling document.
      if (row === 1 && column === 0) {
        await page(tab.id, 'hideOuterChrome', { frameUrl: frameMeta.info?.frameUrl || '' }, 0).catch(() => {});
        outerHidden = true;
      }
      const location = normalizeFrameInfo(await page(tab.id, 'move', { x, y, hideFixed: row > 0 }, frameId), frameId, frameMeta.topInfo, frameMeta.frameMap);
      if (location.error) throw new Error(location.error);
      if (location.viewportWidth !== info.viewportWidth || location.viewportHeight !== info.viewportHeight) throw new Error('The window size changed. Try capturing again.');
      if (Math.abs(location.x - x) > 2 || Math.abs(location.y - y) > 2) throw new Error('This page prevents scrolling to the requested area. Try a visible-tab capture.');
      const bitmap = await screenshot(tab);
      try {
        const screenWidth = info.screenInnerWidth || info.innerWidth;
        const screenHeight = info.screenInnerHeight || info.innerHeight;
        const captureRect = location.captureRect || { x: 0, y: 0, width: screenWidth, height: screenHeight };
        const captureX = Math.max(0, Math.round(captureRect.x * (bitmap.width / screenWidth)));
        const captureY = Math.max(0, Math.round(captureRect.y * (bitmap.height / screenHeight)));
        if (!canvas) {
          scaleX = bitmap.width / screenWidth;
          scaleY = bitmap.height / screenHeight;
          const width = Math.round(info.width * scaleX), height = Math.round(info.height * scaleY);
          validateSize(width, height);
          canvas = new OffscreenCanvas(width, height);
        } else if (Math.abs(bitmap.width / screenWidth - scaleX) > 0.01 || Math.abs(bitmap.height / screenHeight - scaleY) > 0.01) {
          throw new Error('The page zoom changed. Try capturing again.');
        }
        // Tiles are placed at their actual scroll coordinates. Vertical tiles
        // deliberately overlap so a persistent top toolbar can be skipped on
        // later tiles without losing the content hidden beneath it.
        const left = Math.round(x * scaleX);
        const overlapY = row > 0 ? Math.round(verticalOverlap * scaleY) : 0;
        const top = Math.round(y * scaleY) + overlapY;
        const sourceX = captureX;
        const sourceY = captureY + overlapY;
        const tileWidth = Math.round(info.viewportWidth * scaleX);
        const tileHeight = Math.round(info.viewportHeight * scaleY);
        const width = Math.min(tileWidth, canvas.width - left, bitmap.width - sourceX);
        const height = Math.min(tileHeight - overlapY, canvas.height - top, bitmap.height - sourceY);
        if (width <= 0 || height <= 0) throw new Error('The page returned an invalid capture tile. Try capturing again.');
        canvas.getContext('2d').drawImage(bitmap, sourceX, sourceY, width, height, left, top, width, height);
      } finally { bitmap.close(); }
    }
  } finally {
    if (prepared) await page(tab.id, 'restore', {}, frameId).catch(() => {});
    if (outerHidden) await page(tab.id, 'restoreOuterFixed', {}, 0).catch(() => {});
  }
  await finish(canvas, tab, 'Full page');
}

async function run(mode, tab) {
  try {
    if (mode !== 'full') throw new Error('Screener captures full pages only.');
    let frameIds = [0];
    if (!/^https?:\/\//i.test(tab.url || '') && !/^file:/i.test(tab.url || '')) throw new Error('Full-page capture is unavailable on this protected page.');
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      frameIds = [];
      for (const frame of frames || [{ frameId: 0 }]) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frame.frameId] }, files: ['content.js'] });
          frameIds.push(frame.frameId);
        } catch { /* A protected/sandboxed frame is skipped independently. */ }
      }
      if (!frameIds.includes(0)) throw new Error('The page helper could not be injected.');
    } catch {
      // Keep the normal top-frame capture path available if frame discovery
      // is unavailable on an older Chromium build or protected page.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      frameIds = [0];
    }
    const frameMeta = await selectCaptureFrame(tab, frameIds);
    job.frameId = frameMeta.frameId;
    await captureFull(tab, frameMeta);
  } catch (error) {
    update(error.message || 'Capture failed. Refresh the page and try again.', false);
  } finally { job = null; }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  // Control messages come from our popup. Page-helper messages are handled by
  // the capture routines through chrome.tabs.sendMessage and must not be
  // treated as new capture requests here. Brave can attach a tab object to
  // extension pages, so identify the popup by its origin rather than by
  // sender.tab.
  const popupUrl = chrome.runtime.getURL('popup.html');
  const extensionOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
  const fromPopup = sender.url === popupUrl || (!sender.url && sender.origin === extensionOrigin);
  if (!fromPopup) return;
  if (message.type === 'status') { respond(status); return; }
  if (message.type === 'cancel') {
    if (job) { job.cancelled = true; page(job.tabId, 'cancel', {}, job.frameId).catch(() => {}); }
    respond({ ok: true });
    return;
  }
  if (message.type === 'start') {
    if (job) { respond({ error: 'A capture is already in progress.' }); return; }
    if (message.mode !== 'full') { respond({ error: 'Screener captures full pages only.' }); return; }
    job = { cancelled: false };
    update('Starting capture…');
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) throw new Error('No active page found.');
      job.tabId = tab.id;
      respond({ ok: true });
      // Let the action popup close before capturing pixels or showing selection UI.
      return sleep(250).then(() => run(message.mode, tab));
    }).catch(error => { job = null; update(error.message, false); respond({ error: error.message }); });
    return true;
  }
});
