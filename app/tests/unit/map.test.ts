import { describe, expect, it } from 'vitest';
import world from '@design/world.json';
import { awayBadge, groupByFloor, placeText, roomAt, type MapPerson, type MapSnapshot } from '../../src/ui/map';
import type { World } from '../../src/world/types';

const W = world as unknown as World;
const person = (id: string, floor: 'L1' | 'L2', pos: [number, number], movingTo: 'L1' | 'L2' | null = null): MapPerson =>
  ({ id, name: id, role: 'peran', floor, pos, doing: 'santai', busy: false, movingTo });

describe('floor map helpers', () => {
  it('finds the room under a plan point on the right floor', () => {
    expect(roomAt(W, 'L1', [14, 4])?.id).toBe('L1-LOBBY');
    expect(roomAt(W, 'L2', [14, 4])?.id).toBe('L2-LOUNGE');
    expect(roomAt(W, 'L1', [-5, -5])).toBeNull();
  });

  it('splits people into the viewer floor and the other floor, sorted by name', () => {
    const snap: MapSnapshot = { floor: 'L1', pos: [14, 4], facing: 90, visitor: false,
      people: [person('Zed', 'L1', [4, 4]), person('Ana', 'L2', [26, 13]), person('Bo', 'L1', [23, 4])] };
    const g = groupByFloor(snap);
    expect(g.here.map((p) => p.id)).toEqual(['Bo', 'Zed']);
    expect(g.away.map((p) => p.id)).toEqual(['Ana']);
  });

  it('tells the viewer how many people are on the other floor and in which direction', () => {
    const people = [person('A', 'L2', [26, 13]), person('B', 'L2', [10, 20]), person('C', 'L1', [4, 4])];
    const fromL1 = awayBadge(W, { floor: 'L1', pos: [14, 4], facing: 0, visitor: false, people });
    expect(fromL1?.text).toBe('↑ L2: 2');
    expect(fromL1?.label).toBe('2 orang di Lantai 2 (di atas)');
    const fromL2 = awayBadge(W, { floor: 'L2', pos: [14, 4], facing: 0, visitor: false, people });
    expect(fromL2?.text).toBe('↓ L1: 1');
    expect(awayBadge(W, { floor: 'L1', pos: [14, 4], facing: 0, visitor: false, people: [people[2]] })).toBeNull();
  });

  it('names the room, and says so when a persona is on the way to another floor', () => {
    expect(placeText(W, person('A', 'L2', [26, 13]))).toBe('Ruang game');
    expect(placeText(W, person('A', 'L1', [17, 14], 'L2'))).toMatch(/, menuju Lantai 2$/);
  });
});
