// Avoid ambiguous characters: 0/O, 1/I/L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

const PLAYER_COLORS = [
  '#f97316', // orange
  '#06b6d4', // cyan
  '#22c55e', // green
  '#ec4899', // pink
  '#a855f7', // purple
  '#eab308', // yellow
  '#ef4444', // red
  '#14b8a6', // teal
];

export function assignColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
