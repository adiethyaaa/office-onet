// Edge detection for layered menus (office -> Game Station -> mini game).
// A button or key that opened a layer is often still held when the next layer
// starts listening. Counting that as a fresh press made one A press, or one
// held Enter, fall straight through the Game Station into the first game.

/**
 * Rising-edge detector for gamepad buttons. Buttons already down when it is
 * created count as "seen": they must be released and pressed again.
 */
export class PressEdges {
  private prev: boolean[];
  constructor(initial: readonly boolean[] = []) { this.prev = [...initial]; }
  /** Feed one poll; returns a function telling which indices went down this poll. */
  next(raw: readonly boolean[]): (i: number) => boolean {
    const prev = this.prev;
    this.prev = [...raw];
    return (i) => !!raw[i] && !prev[i];
  }
}

/** Current pressed state of the first connected pad (empty when none). */
export function padButtons(pads: readonly (Gamepad | null)[] | undefined): boolean[] {
  const p = [...(pads ?? [])].find((q) => q && q.connected);
  return p ? p.buttons.map((b) => b.pressed || b.value > 0.5) : [];
}

/** Auto-repeat keydowns of a key that was held before a layer opened are not presses. */
export function isFreshKey(e: Pick<KeyboardEvent, 'repeat'>): boolean { return !e.repeat; }
