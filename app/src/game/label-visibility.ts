export type LabelBlocker = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

export function labelClear(left: number, top: number, width: number, height: number, blockers: LabelBlocker[]): boolean {
  return !blockers.some(b => left < b.right + 6 && left + width > b.left - 6
    && top < b.bottom + 6 && top + height > b.top - 6);
}
