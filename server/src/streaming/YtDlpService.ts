import { execFile } from 'child_process';

interface CacheEntry {
  url: string;
  expiresAt: number;
}

export class YtDlpService {
  private cache = new Map<string, CacheEntry>();
  private readonly ttl = 5 * 60 * 1000; // 5 minutes

  constructor() {
    setInterval(() => this.cleanup(), 60_000);
  }

  async getAudioUrl(videoId: string): Promise<string> {
    const cached = this.cache.get(videoId);
    if (cached && Date.now() < cached.expiresAt) return cached.url;

    let url: string;
    try {
      // YouTube's bot-detection increasingly blocks anonymous requests
      // ("Sign in to confirm you're not a bot") — a logged-in browser's
      // cookies get past this. Falls back to the cookie-less request
      // for machines without Chrome / a logged-in YouTube session.
      url = await this.run(videoId, true);
    } catch {
      url = await this.run(videoId, false);
    }
    this.cache.set(videoId, { url, expiresAt: Date.now() + this.ttl });
    return url;
  }

  private run(videoId: string, useCookies: boolean): Promise<string> {
    const args = [
      '--get-url',
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '--extractor-args', 'youtube:player_client=tv_embedded',
      '--no-playlist',
      '--no-warnings',
      ...(useCookies ? ['--cookies-from-browser', 'chrome'] : []),
      `https://music.youtube.com/watch?v=${videoId}`,
    ];
    return new Promise((resolve, reject) => {
      execFile('yt-dlp', args, { timeout: 20_000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`yt-dlp error for ${videoId} (cookies=${useCookies}):`, stderr);
          return reject(new Error(`yt-dlp failed: ${error.message}`));
        }
        const url = stdout.trim().split('\n')[0]; // take first URL if multiple
        if (!url) return reject(new Error('yt-dlp returned empty URL'));
        resolve(url);
      });
    });
  }

  // Pre-fetch in background, ignore errors
  prefetch(videoId: string): void {
    this.getAudioUrl(videoId).catch(() => {});
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }
}
