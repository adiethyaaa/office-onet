export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

let toastTimer = 0;
/**
 * A modal <dialog> sits in the browser's top layer, above any z-index, so a
 * plain toast under an open chat was never seen (mic errors looked like
 * "nothing happens"). As a manual popover the toast joins the top layer and,
 * shown after the dialog, lands above it.
 */
export function toast(message: string, ms = 2600): void {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  const pop = typeof t.showPopover === 'function';
  if (pop) {
    if (!t.hasAttribute('popover')) t.setAttribute('popover', 'manual');
    try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch { /* not connected */ }
  }
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    t.hidden = true;
    if (pop) try { t.hidePopover(); } catch { /* already hidden */ }
  }, ms);
}

/** Open a native modal dialog and give focus back to the opener on close. */
export function openDialog(dlg: HTMLDialogElement, opener?: HTMLElement | null): void {
  const back = opener ?? (document.activeElement as HTMLElement | null);
  dlg.addEventListener('close', () => { if (back && document.contains(back)) back.focus(); }, { once: true });
  if (!dlg.open) dlg.showModal();
}

export function anyDialogOpen(): boolean {
  return !!document.querySelector('dialog[open]');
}
