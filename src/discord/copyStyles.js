/** Scoped styles: never change Discord's own buttons or message layout. */
const icon = path => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`)}")`;
export const COPY_STYLES = `
[data-dpd-copy] { display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding:12px 0 6px; }
[data-dpd-copy] .dpd-copy-button {
 appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:9px;
 min-height:40px; padding:9px 15px; border:1px solid rgba(255,255,255,.13); border-radius:10px;
 background:#353741; color:#f4f5f8; font:600 13px/20px system-ui,sans-serif;
 letter-spacing:.1px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,.12);
 transition:background .15s,border-color .15s,box-shadow .15s,transform .15s;
}
[data-dpd-copy] .dpd-copy-button[data-kind="image"] { background:#b91c43; border-color:#d83259; }
[data-dpd-copy] .dpd-copy-button:hover:not(:disabled) { background:#444754; border-color:rgba(255,255,255,.28); box-shadow:0 3px 9px rgba(0,0,0,.18); transform:translateY(-1px); }
[data-dpd-copy] .dpd-copy-button[data-kind="image"]:hover:not(:disabled) { background:#ce2550; border-color:#ef557c; }
[data-dpd-copy] .dpd-copy-button:active:not(:disabled) { transform:translateY(0); box-shadow:none; }
[data-dpd-copy] .dpd-copy-button:focus-visible { outline:2px solid #b4beff; outline-offset:3px; }
[data-dpd-copy] .dpd-copy-button::before { content:""; flex:none; width:18px; height:18px; background:currentColor; mask:center/contain no-repeat; }
[data-dpd-copy] .dpd-copy-button[data-kind="image"]::before { mask-image:${icon('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>')}; }
[data-dpd-copy] .dpd-copy-button[data-kind="caption"]::before { mask-image:${icon('<rect x="6" y="3" width="15" height="17" rx="2"/><path d="M3 7v14a1 1 0 0 0 1 1h12M10 8h7M10 12h7M10 16h4"/>')}; }
[data-dpd-copy] .dpd-copy-button[data-state="success"] { background:#183c32; border-color:#367d63; color:#c1f4d9; }
[data-dpd-copy] .dpd-copy-button[data-state="success"]::before { mask-image:${icon('<path d="m5 12 4 4L19 6"/>')}; }
[data-dpd-copy] .dpd-copy-button:disabled { cursor:wait; opacity:.7; }
[data-dpd-copy] [role="status"] { flex-basis:100%; color:#b5bac1; font:12px/18px system-ui,sans-serif; }
[data-dpd-copy] [role="status"]:empty { display:none; }
[data-dpd-copy] [role="status"][data-state="error"] { color:#ffb0b7; }
@media (prefers-reduced-motion:reduce) { [data-dpd-copy] .dpd-copy-button { transition:none; transform:none!important; } }
`;

export function installCopyStyles(doc) {
  if (doc.getElementById?.('dpd-report-copy-style')) return;
  const style = doc.createElement('style');
  style.id = 'dpd-report-copy-style'; style.textContent = COPY_STYLES;
  doc.head?.append(style);
}
