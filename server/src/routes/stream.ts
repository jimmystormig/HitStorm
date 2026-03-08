import { Router } from 'express';
import type { Request, Response } from 'express';
import { YtDlpService } from '../streaming/YtDlpService.js';

const ytdlp = new YtDlpService();

export { ytdlp }; // shared instance for pre-fetching

const router = Router();

router.get('/api/stream/:videoId', async (req: Request<{ videoId: string }>, res: Response) => {
  const { videoId } = req.params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  try {
    const audioUrl = await ytdlp.getAudioUrl(videoId);

    // Fetch from YouTube and proxy through
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    };
    if (req.headers.range) headers['Range'] = req.headers.range;

    const upstream = await fetch(audioUrl, { headers });

    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    const cl = upstream.headers.get('content-length');
    if (cl) res.set('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) res.set('Content-Range', cr);
    res.set('Accept-Ranges', 'bytes');
    res.set('Access-Control-Allow-Origin', '*');

    if (!upstream.body) { res.end(); return; }

    // Stream the response
    const reader = upstream.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          if (!res.writable) { reader.cancel(); break; }
          res.write(value);
        }
      } catch {
        res.end();
      }
    };
    req.on('close', () => reader.cancel());
    pump();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Stream error for ${videoId}:`, message);
    if (!res.headersSent) res.status(502).json({ error: 'Failed to stream audio', detail: message });
  }
});

export default router;
