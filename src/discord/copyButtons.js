import { readReport, imagePng } from './reportCopy.js';

export function createReportControls({
  copyText = text => globalThis.navigator.clipboard.writeText(text),
  copyImage = url => {
    const png = imagePng(url);
    void png.catch(() => {});
    return globalThis.navigator.clipboard.write([new globalThis.ClipboardItem({ 'image/png': png })]);
  },
} = {}) {
  const mounted = new WeakMap();
  return function mount(row) {
    const report = readReport(row), previous = mounted.get(row);
    if (previous && previous.toolbar.parentNode === row && report?.caption === previous.caption && report?.url === previous.url) return;
    if (previous) { previous.toolbar.remove(); mounted.delete(row); }
    if (!report) return;
    const doc = row.ownerDocument, toolbar = doc.createElement('div'), status = doc.createElement('span');
    toolbar.setAttribute('data-dpd-copy', 'true');
    Object.assign(toolbar.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 0', alignItems: 'center' });
    status.setAttribute('role', 'status');
    Object.assign(status.style, { color: '#b5bac1', fontSize: '12px' });
    for (const [label, action, success] of [
      ['📋 Копіювати картинку', () => copyImage(report.url), 'Картинку скопійовано — встав у WhatsApp.'],
      ['📋 Копіювати підпис', () => copyText(report.caption), 'Підпис скопійовано — встав у поле під картинкою.'],
    ]) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
      Object.assign(button.style, { background: '#404249', color: '#fff', border: '1px solid #666', borderRadius: '5px', padding: '8px 12px', cursor: 'pointer', font: '14px system-ui' });
      button.addEventListener('click', async event => {
        event?.preventDefault?.(); event?.stopPropagation?.();
        const current = readReport(row);
        if (!current || current.caption !== report.caption || current.url !== report.url) { status.textContent = 'Звіт змінився або недоступний. Спробуй новий /report.'; return; }
        button.disabled = true;
        try { await action(); status.textContent = success; }
        catch { status.textContent = 'Не вдалося скопіювати. Перевір дозвіл браузера або спробуй новий /report.'; }
        finally { button.disabled = false; }
      });
      toolbar.append(button);
    }
    toolbar.append(status); row.append(toolbar);
    mounted.set(row, { ...report, toolbar });
  };
}

export function startDiscordCopy() {
  if (globalThis.location.origin !== 'https://discord.com' || !globalThis.location.pathname.startsWith('/channels/')) return;
  if (globalThis.__dpdReportCopy) { globalThis.__dpdReportCopy.scan(); return; }
  const mount = createReportControls();
  let timer;
  const scan = () => {
    for (const row of document.querySelectorAll('[id^="chat-messages-"]')) mount(row);
  };
  const observer = new globalThis.MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 150);
  });
  globalThis.__dpdReportCopy = { scan };
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'id'] });
  scan();
}
