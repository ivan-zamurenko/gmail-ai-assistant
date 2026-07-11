/**
 * popup/statusHelper.js
 * =====================
 * Shared helper for updating status dots and message elements.
 */

export function setStatus(dot, label, msgEl, state, text) {
  dot.className   = 'status__dot';
  msgEl.hidden    = true;
  msgEl.className = 'message';

  switch (state) {
    case 'running':
      dot.classList.add('status__dot--running');
      label.textContent = text ?? 'Running...';
      break;
    case 'error':
      dot.classList.add('status__dot--error');
      label.textContent = 'Error';
      msgEl.textContent = text ?? 'Something went wrong.';
      msgEl.classList.add('message--error');
      msgEl.hidden = false;
      break;
    case 'done':
      label.textContent = text ?? 'Done';
      break;
    default:
      label.textContent = text ?? 'Idle';
  }
}
