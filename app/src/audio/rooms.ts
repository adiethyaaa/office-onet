// Which music track plays where. Kept out of audio.ts so the office can pick a
// track without loading the synthesiser.

/** Room id -> track. Unlisted rooms keep the floor default. */
export function trackForRoom(roomId: string | null, floor: string): string {
  if (!roomId) return floor === 'L2' ? 'lounge' : 'office';
  if (roomId === 'L1-LOBBY' || roomId === 'L1-GALLERY') return 'lobby';
  if (roomId === 'L2-GAME') return 'arcade';
  if (roomId === 'L2-GYM') return 'gym';
  if (roomId === 'L2-LOUNGE' || roomId === 'L2-DINE' || roomId === 'L1-PANTRY') return 'cafe';
  if (roomId === 'L2-READ' || roomId === 'L2-GARDEN' || roomId === 'L2-BALCONY') return 'calm';
  return floor === 'L2' ? 'lounge' : 'office';
}
