/** Best-effort UI cleanup. No tokens/content persisted and no domain actions retried. */
const PRIVATE_MS = 14 * 60_000;
const MESSAGE_MS = 30 * 60_000;
const isPrivate = value => Boolean(Number(value?.flags?.bitfield ?? value?.flags ?? 0) & 64) || value?.ephemeral === true;

export function createResponseLifecycle({ now = Date.now, schedule = setTimeout,
  warn = code => console.warn(code) } = {}) {
  function removeLater(remove, deadline) {
    const timer = schedule(async () => {
      try { await remove(); }
      catch (error) { if (error?.code !== 10008) warn('[cleanup] DELETE_FAILED'); }
    }, Math.max(0, deadline - now()));
    timer?.unref?.();
  }
  function normalMessage(message, sentAt) {
    if (typeof message?.delete !== 'function') { warn('[cleanup] MESSAGE_UNAVAILABLE'); return; }
    removeLater(() => message.delete(), sentAt + MESSAGE_MS);
  }
  return function wrap(interaction) {
    const created = Number.isFinite(interaction.createdTimestamp) ? interaction.createdTimestamp : now();
    const deadline = created + PRIVATE_MS;
    let originalScheduled = false;
    let privateOriginal = false;
    let expired = false;
    const windowExpired = () => expired || now() >= deadline;
    const guard = () => { if (windowExpired()) throw new Error('Response window expired; result not delivered'); };
    async function original(options) {
      if (originalScheduled) return;
      originalScheduled = true;
      privateOriginal = interaction.ephemeral === true || isPrivate(options);
      if (privateOriginal) {
        removeLater(async () => { expired = true; await interaction.deleteReply(); }, deadline);
      } else {
        const sentAt = now();
        try { normalMessage(await interaction.fetchReply(), sentAt); }
        catch { warn('[cleanup] MESSAGE_UNAVAILABLE'); }
      }
    }
    const user = interaction.user && new Proxy(interaction.user, {
      get(target, key) {
        if (key === 'send') return async (...args) => {
          const message = await target.send(...args);
          normalMessage(message, now());
          return message;
        };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return new Proxy(interaction, {
      get(target, key) {
        if (key === 'user') return user;
        if (key === 'autoCleanupExpired') return privateOriginal && windowExpired();
        if (key === 'reply' || key === 'deferReply') return async (...args) => {
          const response = await target[key](...args);
          await original(args[0]);
          return response;
        };
        if (key === 'editReply') return async (...args) => {
          if (privateOriginal) guard();
          return target.editReply(...args);
        };
        if (key === 'followUp') return async (...args) => {
          guard();
          const message = await target.followUp(...args);
          // Returned flags reflect Discord's deferred-response inheritance rules.
          if (isPrivate(message)) removeLater(() => target.webhook.deleteMessage(message.id), deadline);
          else normalMessage(message, now());
          return message;
        };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
}
