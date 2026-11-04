/** Keep operator details below the shared 2000-character result contract. */
export function resultDetails(lines) {
  const shown = [];
  let size = 0;
  for (const line of lines) {
    const bounded = line.length > 1800 ? `${line.slice(0, 1799)}…` : line;
    const nextSize = size + bounded.length + (shown.length ? 1 : 0);
    if (shown.length === 25 || nextSize > 1800) break;
    shown.push(bounded);
    size = nextSize;
  }
  if (shown.length < lines.length) shown.push(`… ще ${lines.length - shown.length}`);
  return shown.length ? shown.join('\n') : undefined;
}
