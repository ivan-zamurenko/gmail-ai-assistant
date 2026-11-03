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
  const mounted = new WeakMap(), owned = new WeakSet();
  function mount(row) {
    const report = readReport(row), previous = mounted.get(row);
    // Legacy extension contexts can retain observers until page refresh. Hide their
    // controls in place so they do not continually recreate removed toolbars.
    for (const child of [...row.children]) {
      if (child !== previous?.toolbar && child.parentNode === row && child.getAttribute('data-dpd-copy') === 'true') {
        child.setAttribute('data-dpd-copy-obsolete', 'true');
      }
    }
    if (previous && previous.toolbar.parentNode === row && report?.caption === previous.caption && report?.url === previous.url) return;
    if (previous) { previous.toolbar.remove(); mounted.delete(row); }
    if (!report) return;
    const doc = row.ownerDocument, toolbar = doc.createElement('div'), status = doc.createElement('span');
    installCopyStyles(doc);
    toolbar.setAttribute('data-dpd-copy', 'true');
    owned.add(toolbar);
    status.setAttribute('role', 'status');
    for (const [kind, label, action, success, copied] of [
      ['image', 'Копіювати картинку', () => copyImage(report.url), 'Картинку скопійовано — встав у WhatsApp.', 'Картинку скопійовано'],
      ['caption', 'Копіювати підпис', () => copyText(formatWhatsAppCaption(report.caption)), 'Підпис скопійовано — встав у поле під картинкою.', 'Підпис скопійовано'],
    ]) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
      button.className = 'dpd-copy-button';
      const setLabel = text => {
        button.textContent = text;
        button.setAttribute('aria-label', text);
        button.setAttribute('title', text);
      };
      setLabel(label);
      button.setAttribute('data-kind', kind);
      button.addEventListener('click', async event => {
        event?.preventDefault?.(); event?.stopPropagation?.();
        const current = readReport(row);
        if (!current || current.caption !== report.caption || current.url !== report.url) { status.setAttribute('data-state', 'error'); status.textContent = 'Звіт змінився або недоступний. Спробуй новий /report.'; return; }
        button.disabled = true; setLabel('Копіювання…');
        button.setAttribute('data-state', 'busy'); status.setAttribute('data-state', ''); status.textContent = '';
        try { await action(); button.setAttribute('data-state', 'success'); setLabel(copied); status.textContent = success; }
        catch { button.setAttribute('data-state', ''); setLabel(label); status.setAttribute('data-state', 'error'); status.textContent = 'Не вдалося скопіювати. Перевір дозвіл браузера або спробуй новий /report.'; }
        finally { button.disabled = false; }
      });
      toolbar.append(button);
    }
    toolbar.append(status); row.append(toolbar);
    mounted.set(row, { ...report, toolbar });
  }
  // Discord can move message wrappers. Retire only our marked toolbars,
  // regardless of ancestry, while keeping this controller's controls alive.
  mount.retireLegacyControls = doc => {
    installCopyStyles(doc);
    for (const toolbar of doc.querySelectorAll('[data-dpd-copy="true"]')) {
      if (!owned.has(toolbar)) toolbar.setAttribute('data-dpd-copy-obsolete', 'true');
    }
  };
  return mount;
}

export function startDiscordCopy() {
  if (globalThis.location.origin !== 'https://discord.com' || !globalThis.location.pathname.startsWith('/channels/')) return;
  if (globalThis.__dpdReportCopy?.version === 4) { globalThis.__dpdReportCopy.scan(); return; }
  globalThis.__dpdReportCopy?.stop?.();
  // DOM event also retires helpers surviving in an older isolated context.
  document.dispatchEvent(new globalThis.Event('dpd-report-copy-stop'));
  const mount = createReportControls();
  let timer, stopped = false;
  const scan = () => {
    if (stopped) return;
    for (const row of document.querySelectorAll('[id^="chat-messages-"]')) mount(row);
    mount.retireLegacyControls(document);
  };
  const observer = new globalThis.MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 150);
  });
  const stop = () => {
    stopped = true; clearTimeout(timer); observer.disconnect();
    document.removeEventListener('dpd-report-copy-stop', stop);
    if (globalThis.__dpdReportCopy?.stop === stop) delete globalThis.__dpdReportCopy;
  };
  document.addEventListener('dpd-report-copy-stop', stop);
  globalThis.__dpdReportCopy = { version: 4, scan, stop };
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'id'] });
  scan();
}
