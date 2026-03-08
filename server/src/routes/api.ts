import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PlaylistLoader } from '../playlists/PlaylistLoader.js';

export function createApiRouter(playlists: PlaylistLoader) {
  const router = Router();

  router.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  router.get('/api/playlists', (_req: Request, res: Response) => {
    res.json(playlists.getSummaries());
  });

  return router;
}
