import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Song, PlaylistMeta } from '../../../src/types/index.js';

export interface Playlist {
  id: string;
  name: string;
  description: string;
  songs: Song[];
}

export class PlaylistLoader {
  private playlists = new Map<string, Playlist>();

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) return;
    const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    for (const file of files) {
      try {
        const raw = readFileSync(join(dataDir, file), 'utf-8');
        const data = JSON.parse(raw) as Playlist;
        if (data.id && data.songs?.length) {
          this.playlists.set(data.id, data);
          console.log(`Loaded playlist: ${data.name} (${data.songs.length} songs)`);
        }
      } catch (err) {
        console.warn(`Failed to load playlist ${file}:`, err);
      }
    }
  }

  getSummaries(): PlaylistMeta[] {
    return Array.from(this.playlists.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      songCount: p.songs.length,
    }));
  }

  getById(id: string): Playlist | undefined {
    return this.playlists.get(id);
  }
}
