/** Chrome-storage adapter for extension contexts that expose only runtime messaging. */

async function request(sendMessage, type, payload) {
  const response = await sendMessage({ type, ...payload });
  if (response?.reason) throw new Error(response.reason);
  return response?.result;
}

export function createRuntimeStorage(sendMessage) {
  return {
    get: (key) => request(sendMessage, 'label-recovery-get', { key }),
    set: (entries) => request(sendMessage, 'label-recovery-set', { entries }),
    remove: (key) => request(sendMessage, 'label-recovery-remove', { key }),
  };
}
