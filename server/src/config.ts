import { networkInterfaces } from 'os';
import { join } from 'path';

export const PORT = parseInt(process.env.PORT ?? '3000', 10);
export const DATA_DIR = join(process.cwd(), 'data', 'playlists');
export const CLIENT_DIST = join(process.cwd(), 'dist', 'client');
export const IS_DEV = process.env.NODE_ENV !== 'production';
export const WIN_SCORE = 10;
export const MAX_PLAYERS = 8;
export const REVEAL_DURATION_MS = 5000;
export const BUZZ_WINDOW_MS = 8000; // time for artist buzz after placement
export const ARTIST_TITLE_WINDOW_MS = 15000; // time for active player to guess artist+title in Pro mode

export function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
