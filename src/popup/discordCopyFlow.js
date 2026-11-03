/** Explicit activeTab activation; no permanent Discord host access. */
export async function initDiscordCopy() {
  const section = document.getElementById('discordCopySection');
  const button = document.getElementById('enableDiscordCopy');
  const status = document.getElementById('discordCopyStatus');
  const allowed = value => {
    try { const u = new URL(value); return u.origin === 'https://discord.com' && u.pathname.startsWith('/channels/'); }
    catch { return false; }
  };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!allowed(tab?.url)) return;
    section.hidden = false;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!allowed(current?.url)) throw new Error('Discord tab required');
        await chrome.scripting.executeScript({ target: { tabId: current.id }, files: ['src/discord/entry.js'] });
        status.textContent = 'Увімкнено для цієї вкладки. Кнопки з’являться біля відкритого /report. Після оновлення сторінки ввімкни знову.';
      } catch { status.textContent = 'Не вдалося ввімкнути. Відкрий чат Discord у цій вкладці й спробуй ще раз.'; }
      finally { button.disabled = false; }
    });
  } catch { /* No eligible active tab; depot/Gmail remain available. */ }
}
