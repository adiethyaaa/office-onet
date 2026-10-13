import { describe, expect, it } from 'vitest';
import worldJson from '@design/world.json';
import type { World } from '../../src/world/types';
import { FACILITY_GAMES, facilityGame } from '../../src/minigames/facility';
import { ARCADE_SLOTS, ARCADE_INFO, GAMES } from '../../src/minigames/registry';
import { crossfade } from '../../src/game/avatar';
import { trackForRoom } from '../../src/audio/rooms';
import { SCOLD_LINES } from '../../src/game/scold';
import { EN } from '../../src/i18n/en';

const world = worldJson as unknown as World;

describe('v2.0 facilities and Game Station', () => {
  it('every facility fixture type maps to a registered game and exists in the world', () => {
    for (const f of FACILITY_GAMES) {
      if (f.game !== 'arcade') expect(GAMES[f.game], f.game).toBeTypeOf('function');
      expect(world.fixtures.some((x) => x.type === f.type), f.type).toBe(true);
    }
  });

  it('PRD facilities each reach their game: gym, billiards, coffee, server, drafting, easel, library', () => {
    const want: Record<string, string> = {
      treadmill: 'lari-pagi', dumbbell_rack: 'angkat-beban', exercise_mat: 'peregangan', billiard_table: 'biliar',
      coffee_bar: 'barista', rack_42u: 'server-down', drafting_table: 'susun-denah', easel: 'desain-poster', arcade_cabinet: 'arcade',
    };
    for (const [type, game] of Object.entries(want)) {
      const fx = world.fixtures.find((x) => x.type === type)!;
      expect(facilityGame(fx.type, fx.room), type).toBe(game);
    }
    const shelfRead = world.fixtures.find((x) => x.type === 'bookshelf' && x.room === 'L2-READ')!;
    const shelfWork = world.fixtures.find((x) => x.type === 'bookshelf' && x.room !== 'L2-READ')!;
    expect(facilityGame(shelfRead.type, shelfRead.room)).toBe('kuis-perpustakaan');
    expect(facilityGame(shelfWork.type, shelfWork.room)).toBeNull();
  });

  it('chess is played at the board game table and its stools in the game room, not in the Game Station', () => {
    const table = world.fixtures.find((x) => x.type === 'board_table')!;
    expect(table.room).toBe('L2-GAME');
    expect(facilityGame(table.type, table.room)).toBe('catur');
    const stools = world.fixtures.filter((x) => x.type === 'stool' && x.room === 'L2-GAME');
    expect(stools.length).toBeGreaterThanOrEqual(2);
    for (const s of stools) {
      expect(facilityGame(s.type, s.room)).toBe('catur');
      expect(Math.hypot(s.pos[0] - table.pos[0], s.pos[1] - table.pos[1])).toBeLessThan(1.6);
    }
    const pantryStool = world.fixtures.find((x) => x.type === 'stool' && x.room !== 'L2-GAME')!;
    expect(facilityGame(pantryStool.type, pantryStool.room)).toBeNull();
    expect(ARCADE_SLOTS).not.toContain('catur');
  });

  it('Game Station has 10 slots, 5 filled, all loadable and described', () => {
    expect(ARCADE_SLOTS).toHaveLength(10);
    const filled = ARCADE_SLOTS.filter(Boolean) as string[];
    expect(filled).toHaveLength(5);
    for (const id of filled) {
      expect(GAMES[id]).toBeTypeOf('function');
      expect(ARCADE_INFO[id].title).toBeTruthy();
    }
  });

  it('every game module loads and its meta matches its id', async () => {
    for (const [id, load] of Object.entries(GAMES)) {
      const m = (await load()).default;
      expect(m.meta.id, id).toBe(id);
      expect(EN[m.meta.title], `${id} title in English`).toBeTruthy();
    }
  });
});

describe('v2.0 animation and sound helpers', () => {
  it('crossfade depends on the clip pair', () => {
    expect(crossfade('walk', 'run')).toBeLessThan(crossfade('idle', 'sit'));
    expect(crossfade('idle', 'surprised')).toBeLessThan(0.1);
    expect(crossfade('idle', 'wave')).toBe(0.25);
  });

  it('music follows the area', () => {
    expect(trackForRoom('L2-GAME', 'L2')).toBe('arcade');
    expect(trackForRoom('L2-GYM', 'L2')).toBe('gym');
    expect(trackForRoom(null, 'L1')).toBe('office');
    for (const r of world.rooms) expect(trackForRoom(r.id, r.floor)).toBeTruthy();
  });

  it('every persona has reprimand lines, all translated', () => {
    for (const a of world.actors.filter((x) => x.kind === 'npc')) {
      expect(SCOLD_LINES[a.id], a.id).toBeTruthy();
      for (const l of SCOLD_LINES[a.id]) expect(EN[l], l).toBeTruthy();
    }
  });
});
