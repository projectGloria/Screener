import { getCapture } from './database.js';
import { exportCapture } from './export.js';
let capture, url;
const details = document.querySelector('#details');
try {
  capture = await getCapture(new URLSearchParams(location.search).get('id'));
  if (!capture) throw new Error('This preview has expired or is unavailable. Capture the page again.');
  url = URL.createObjectURL(capture.blob);
  const img = document.querySelector('#image');
  img.src = url;
  await img.decode();
  img.hidden = false;
  document.querySelector('#title').textContent = capture.title;
  document.querySelector('#mode').textContent = capture.mode.toUpperCase();
  details.textContent = `${capture.width.toLocaleString()} × ${capture.height.toLocaleString()} px · ${(capture.blob.size / 1048576).toFixed(2)} MB · PNG`;
  document.querySelectorAll('button').forEach(button => { button.disabled = false; });
  document.querySelector('#format').disabled = false;
} catch (error) {
  document.querySelector('#title').textContent = 'Capture unavailable';
  details.textContent = error.message;
}
const formatSelect = document.querySelector('#format');
const downloadButton = document.querySelector('#download');
const exportStatus = document.querySelector('#export-status');
formatSelect.addEventListener('change', () => {
  downloadButton.textContent = `Download ${formatSelect.value.toUpperCase()} ↓`;
  exportStatus.textContent = formatSelect.value === 'pdf' ? 'PDF preserves the screenshot on one continuous page.' : '';
});
downloadButton.addEventListener('click', async () => {
  const format = formatSelect.value;
  downloadButton.disabled = formatSelect.disabled = true;
  downloadButton.textContent = 'Preparing…';
  exportStatus.textContent = '';
  try {
    const blob = await exportCapture(capture, format);
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${capture.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 90) || 'Screenshot'}-${new Date(capture.created).toISOString().replace(/[:.]/g, '-')}.${format}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
    exportStatus.textContent = `${format.toUpperCase()} download started.`;
  } catch (error) {
    exportStatus.textContent = `Download failed: ${error.message}`;
  } finally {
    downloadButton.disabled = formatSelect.disabled = false;
    downloadButton.textContent = `Download ${format.toUpperCase()} ↓`;
  }
});
document.querySelector('#copy').addEventListener('click', async event => {
  const button = event.currentTarget;
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': capture.blob })]); button.textContent = 'Copied!'; }
  catch { button.textContent = 'Copy unavailable'; exportStatus.textContent = 'Clipboard access was unavailable. Use Download to save your image.'; }
  setTimeout(() => { button.textContent = 'Copy image'; }, 2000);
});
document.querySelector('#zoom').addEventListener('click', event => {
  const actual = document.querySelector('#stage').classList.toggle('actual');
  event.currentTarget.textContent = actual ? 'Fit to width' : 'Actual size';
});
addEventListener('unload', () => { if (url) URL.revokeObjectURL(url); });
