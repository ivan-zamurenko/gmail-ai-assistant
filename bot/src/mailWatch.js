/** Polls the work-PC extension for new depot22 mail and posts each message once. */
import { COMMANDS } from './contract.js';
import { safeErrorMessage } from './errors.js';
import { renderMailCard } from './mailViews.js';

export const MAIL_ACTOR = 'mail-watch';

export function createMailWatch({ enqueueAndWait, acknowledgeResult, getChannel, store, guildId, now = Date.now, log = console }) {
  let running = null;
  let problem = null;

  async function notify(text) {
    try { await (await getChannel()).send({ content: text }); } catch (err) { log.error('Mail notice failed:', safeErrorMessage(err, 'Discord send failed')); }
  }

  async function run() {
    let result;
    try {
      result = await enqueueAndWait({ command: COMMANDS.MAIL_CHECK, args: {}, requestedBy: MAIL_ACTOR }, { timeoutMs: 90_000 });
    } catch (err) {
      result = { status: 'error', summary: safeErrorMessage(err, 'Робочий ПК не відповідає') };
    }
    if (result.id) await acknowledgeResult(result.id, { requestedBy: MAIL_ACTOR, guildId }).catch(() => {});
    if (result.status !== 'done') {
      // One notice per distinct problem, not one every two minutes.
      if (problem !== result.summary) { problem = result.summary; await notify(`⚠️ **Пошта не перевіряється:** ${result.summary}`); }
      return;
    }
    if (problem) { problem = null; await notify('✅ **Пошта знову перевіряється.**'); }
    const mail = Array.isArray(result.parcel?.mail) ? result.parcel.mail : [];
    const channel = mail.some(item => !store.has(item?.id)) ? await getChannel() : null;
    for (const item of [...mail].reverse()) {
      if (typeof item?.id !== 'string' || store.has(item.id)) continue;
      const entry = { ...item, seenAt: now() };
      const posted = await channel.send(renderMailCard(entry));
      store.put({ ...entry, postedId: posted.id });
    }
    store.prune();
  }

  /** Concurrent callers share one in-flight check. */
  function poll() {
    running ??= run().catch(err => log.error('Mail poll failed:', safeErrorMessage(err, 'Mail poll failed'))).finally(() => { running = null; });
    return running;
  }

  return { poll };
}
