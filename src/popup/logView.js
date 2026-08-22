/**
 * popup/logView.js
 * ================
 * A running commentary inside the popup, for the times when opening devtools
 * is not an option.
 */

// Enough to review a whole scan, few enough that the popup stays responsive.
const MAX_LINES = 300;

export function createLog(element) {
  function write(text, kind) {
    const line = document.createElement('div');
    line.className = `log__line log__line--${kind}`;
    line.textContent = text;
    element.appendChild(line);

    while (element.childElementCount > MAX_LINES) element.firstElementChild.remove();
    element.scrollTop = element.scrollHeight;
  }

  return {
    start(text) {
      element.textContent = '';
      element.hidden = false;
      write(text, 'info');
    },
    info: (text) => write(text, 'info'),
    ok:   (text) => write(text, 'ok'),
    warn: (text) => write(text, 'warn'),
    fail: (text) => write(text, 'fail'),
  };
}
