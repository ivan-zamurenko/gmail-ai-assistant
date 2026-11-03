import { formatWhatsAppCaption } from '../../shared/whatsappCaption.js';
import { readReport, imagePng } from './reportCopy.js';
import { installCopyStyles } from './copyStyles.js';

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
    installCopyStyles(doc);
    toolbar.setAttribute('data-dpd-copy', 'true');
    status.setAttribute('role', 'status');
    for (const [kind, label, action, success, copied] of [
      ['image', 'Копіювати картинку', () => copyImage(report.url), 'Картинку скопійовано — встав у WhatsApp.', 'Картинку скопійовано'],
      ['caption', 'Копіювати підпис', () => copyText(formatWhatsAppCaption(report.caption)), 'Підпис скопійовано — встав у поле під картинкою.', 'Підпис скопійовано'],
    ]) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
      button.className = 'dpd-copy-button';
      button.setAttribute('data-kind', kind);
      button.addEventListener('click', async event => {
        event?.preventDefault?.(); event?.stopPropagation?.();
        const current = readReport(row);
        if (!current || current.caption !== report.caption || current.url !== report.url) { status.setAttribute('data-state', 'error'); status.textContent = 'Звіт змінився або недоступний. Спробуй новий /report.'; return; }
        button.disabled = true; button.textContent = 'Копіювання…';
        button.setAttribute('data-state', 'busy'); status.setAttribute('data-state', ''); status.textContent = '';
        try { await action(); button.setAttribute('data-state', 'success'); button.textContent = copied; status.textContent = success; }
        catch { button.setAttribute('data-state', ''); button.textContent = label; status.setAttribute('data-state', 'error'); status.textContent = 'Не вдалося скопіювати. Перевір дозвіл браузера або спробуй новий /report.'; }
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
