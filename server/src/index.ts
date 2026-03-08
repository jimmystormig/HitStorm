import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import { join } from 'path';
import { existsSync } from 'fs';
import { PORT, DATA_DIR, CLIENT_DIST, IS_DEV, getLocalIP } from './config.js';
import { createApiRouter } from './routes/api.js';
import streamRouter from './routes/stream.js';
import { PlaylistLoader } from './playlists/PlaylistLoader.js';
import { RoomManager } from './game/RoomManager.js';
import { setupHandlers } from './socket/handlers.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
  pingInterval: 10_000,
  pingTimeout: 5_000,
});

app.use(express.json());
app.use(streamRouter);

const playlists = new PlaylistLoader(DATA_DIR);
const rooms = new RoomManager();

app.use(createApiRouter(playlists));

if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
}

setupHandlers(io, rooms, playlists);

httpServer.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║          HitStorm is running!         ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  Players:  http://${ip}:${PORT}       `);
  console.log(`  ║  Local:    http://localhost:${PORT}   `);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
