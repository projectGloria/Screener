const buttons = [...document.querySelectorAll('[data-mode]')];
const status = document.querySelector('#status');
const version = document.querySelector('#version');
if (version) version.textContent = `v${chrome.runtime.getManifest().version} · No account`;
async function refresh() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'status' });
    status.textContent = result.message;
    buttons.forEach(button => { button.disabled = result.busy; });
    document.querySelector('#cancel').hidden = !result.busy;
    const wrap = document.querySelector('#progress-wrap'), label = document.querySelector('#progress-label'), percent = document.querySelector('#progress-percent'), bar = document.querySelector('#progress-bar');
    const match = result.message.match(/Capturing page · (\d+) of (\d+)/i);
    if (match) { const value = Math.min(100, Math.round(Number(match[1]) / Number(match[2]) * 100)); wrap.hidden = false; label.textContent = `Capturing tile ${match[1]} of ${match[2]}`; percent.textContent = `${value}%`; bar.style.width = `${value}%`; bar.classList.remove('complete'); }
    else if (!result.busy && /downloaded|ready/i.test(result.message)) { wrap.hidden = false; label.textContent = 'Capture complete'; percent.textContent = '100%'; bar.style.width = '100%'; bar.classList.add('complete'); }
    else if (result.busy) { wrap.hidden = false; label.textContent = result.message; percent.textContent = '…'; bar.style.width = '8%'; bar.classList.remove('complete'); }
    else wrap.hidden = true;
  } catch { status.textContent = 'Reload the extension and try again.'; }
}
buttons.forEach(button => button.addEventListener('click', async () => {
  buttons.forEach(item => { item.disabled = true; });
  try {
    const result = await chrome.runtime.sendMessage({ type: 'start', mode: button.dataset.mode });
    if (result.error) { status.textContent = result.error; await refresh(); }
    else await refresh();
  } catch (error) { status.textContent = error.message; buttons.forEach(item => { item.disabled = false; }); }
}));
document.querySelector('#cancel').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'cancel' });
  await refresh();
});
addEventListener('keydown', async event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  await chrome.runtime.sendMessage({ type: 'cancel' });
  await refresh();
});
refresh();
setInterval(refresh, 800);
