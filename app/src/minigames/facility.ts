// Fixture type -> mini game. Kept apart from registry.ts so the office entry
// chunk can ask "does this fixture have a game?" without pulling the loaders.

/**
 * Slots on these fixtures open the game instead of the old virtual activity.
 * `rooms` narrows a type to certain rooms (only the library shelves run the
 * quiz; shelves in work areas stay decoration).
 */
export const FACILITY_GAMES: { type: string; game: string; rooms?: string[] }[] = [
  { type: 'treadmill', game: 'lari-pagi' },
  { type: 'exercise_bike', game: 'lari-pagi' },
  { type: 'dumbbell_rack', game: 'angkat-beban' },
  { type: 'exercise_mat', game: 'peregangan' },
  { type: 'billiard_table', game: 'biliar' },
  { type: 'coffee_bar', game: 'barista' },
  { type: 'rack_42u', game: 'server-down' },
  { type: 'drafting_table', game: 'susun-denah' },
  { type: 'easel', game: 'desain-poster' },
  { type: 'bookshelf', game: 'kuis-perpustakaan', rooms: ['L2-READ'] },
  // Chess is played at the board game table in the game room (Budi): sit on
  // one of its stools or use the table itself. Not a Game Station slot.
  { type: 'board_table', game: 'catur' },
  { type: 'stool', game: 'catur', rooms: ['L2-GAME'] },
  { type: 'arcade_cabinet', game: 'arcade' },
  { type: 'media_console', game: 'arcade' },
  { type: 'beanbag', game: 'arcade', rooms: ['L2-GAME'] },
];

export const FACILITY_TITLE: Record<string, string> = {
  'lari-pagi': 'Lari Pagi', 'angkat-beban': 'Angkat Beban', 'peregangan': 'Peregangan', 'biliar': 'Biliar 8-Ball',
  'barista': 'Barista', 'server-down': 'Server Down', 'susun-denah': 'Susun Denah', 'desain-poster': 'Desain Poster',
  'kuis-perpustakaan': 'Kuis Perpustakaan', 'catur': 'Catur Kantor', 'arcade': 'Game Station',
};

export function facilityGame(type: string, room: string | undefined): string | null {
  const m = FACILITY_GAMES.find((f) => f.type === type && (!f.rooms || (room !== undefined && f.rooms.includes(room))));
  return m?.game ?? null;
}
