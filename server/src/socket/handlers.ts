import type { Server, Socket } from 'socket.io';
import { EVENTS } from '../../../src/types/index.js';
import type { RoomManager } from '../game/RoomManager.js';
import { GameEngine } from '../game/GameEngine.js';
import type { PlaylistLoader } from '../playlists/PlaylistLoader.js';
import { ytdlp } from '../routes/stream.js';
import { PORT, getLocalIP, BUZZ_WINDOW_MS, REVEAL_DURATION_MS, ARTIST_TITLE_WINDOW_MS } from '../config.js';

const engine = new GameEngine();

export function setupHandlers(io: Server, rooms: RoomManager, playlists: PlaylistLoader) {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] new connection: ${socket.id}`);
    const emit = (event: string, data: unknown) => socket.emit(event, data);
    const broadcast = (roomCode: string, event: string, data: unknown) =>
      io.to(roomCode).emit(event, data);

    socket.on('ping_check', () => socket.emit('pong_check'));

    // ─── Room management ─────────────────────────────────────────────────────

    socket.on(EVENTS.ROOM_CREATE, ({ playerName, gameMode, winScore } = {}) => {
      if (!playerName?.trim()) return emit(EVENTS.ROOM_ERROR, { message: 'Name required' });
      const ws = typeof winScore === 'number' && winScore >= 5 && winScore <= 50 ? winScore : 10;
      const room = rooms.createRoom(socket.id, playerName, gameMode ?? 'classic', ws);
      socket.join(room.code);
      const ip = getLocalIP();
      emit(EVENTS.ROOM_CREATED, {
        roomCode: room.code,
        playerId: socket.id,
        joinUrl: `http://${ip}:${PORT}/?join=${room.code}`,
        hostDisplayUrl: `http://${ip}:${PORT}/host/${room.code}`,
      });
      broadcast(room.code, EVENTS.ROOM_UPDATED, {
        roomCode: room.code,
        phase: room.phase,
        players: rooms.toPlayerInfoList(room),
        hostId: room.hostId,
        settings: room.settings,
        selectedPlaylistId: room.selectedPlaylistId,
      });
    });

    socket.on(EVENTS.ROOM_JOIN, ({ roomCode, playerName } = {}) => {
      console.log(`[join] ROOM_JOIN received: roomCode=${roomCode}, playerName=${playerName}, socket=${socket.id}`);
      if (!playerName?.trim()) return emit(EVENTS.ROOM_ERROR, { message: 'Name required' });

      // Host display: observer only — subscribe to room events, don't add as player
      if (playerName === '__host_display__') {
        const room = rooms.getRoom(roomCode?.toUpperCase());
        if (!room) return emit(EVENTS.ROOM_ERROR, { message: 'Room not found' });
        socket.join(room.code);
        emit(EVENTS.ROOM_CREATED, {
          roomCode: room.code,
          playerId: socket.id,
          joinUrl: `http://${getLocalIP()}:${PORT}/?join=${room.code}`,
          hostDisplayUrl: `http://${getLocalIP()}:${PORT}/host/${room.code}`,
        });
        emit(EVENTS.ROOM_UPDATED, {
          roomCode: room.code,
          phase: room.phase,
          players: rooms.toPlayerInfoList(room),
          hostId: room.hostId,
          settings: room.settings,
          selectedPlaylistId: room.selectedPlaylistId,
        });

        // If game is in progress, restore host display state
        if (room.phase !== 'lobby') {
          emit(EVENTS.GAME_STARTED, { totalSongs: room.shuffledSongs.length });

          const currentPlayer = engine.getCurrentPlayer(room);
          const activePlayer = currentPlayer ? room.players.get(currentPlayer.id) : null;
          const activePlayerTimeline = activePlayer?.timeline.map(s => ({ year: s.year, title: s.title, artist: s.artist })) ?? [];
          const song = room.shuffledSongs[room.currentSongIndex];

          if (song) {
            emit(EVENTS.GAME_TURN, {
              activePlayerId: currentPlayer?.id,
              activePlayerName: currentPlayer?.name,
              round: room.round,
              totalSongs: room.shuffledSongs.length,
              streamUrl: `/api/stream/${song.videoId}`,
              activePlayerTimeline,
            });
          }

          if (room.phase === 'placing' && room.placingResult) {
            const placingPlayer = room.players.get(room.placingResult.placingPlayerId);
            const placingTimeline = placingPlayer?.timeline.map(s => ({ year: s.year, title: s.title, artist: s.artist })) ?? [];
            const isProMode = room.settings.gameMode === 'pro';
            const artistTitleActive = isProMode && room.placingResult.correct && !!room.artistTitleTimer;
            const buzzActive = isProMode && !room.placingResult.correct && !!room.buzzTimer;
            const hideTitleArtist = artistTitleActive || buzzActive;
            emit(EVENTS.GAME_RESULT, {
              correct: room.placingResult.correct,
              year: room.placingResult.song.year,
              ...(!hideTitleArtist && {
                title: room.placingResult.song.title,
                artist: room.placingResult.song.artist,
              }),
              scores: engine.getScores(room),
              activePlayerTimeline: placingTimeline,
            });
            if (artistTitleActive) {
              emit(EVENTS.GAME_ARTIST_TITLE_OPEN, room.artistTitleChoices);
            }
          }
        }

        return;
      }

      const joinedRoom = rooms.getRoom(roomCode?.toUpperCase());
      if (!joinedRoom) return emit(EVENTS.ROOM_ERROR, { message: 'Room not found' });

      // Rejoin by name for ANY phase (lobby reload, mid-game reconnect, etc.)
      const existingPlayer = Array.from(joinedRoom.players.values())
        .find(p => p.name === playerName.trim());

      if (existingPlayer) {
        console.log(`[rejoin] ${playerName.trim()} reconnected (new socket: ${socket.id})`);
        rooms.rejoinPlayer(existingPlayer.id, socket.id, joinedRoom.code);
        socket.join(joinedRoom.code);
        const player = joinedRoom.players.get(socket.id)!;
        const ip = getLocalIP();

        if (joinedRoom.phase === 'lobby') {
          // Lobby rejoin: restore identity and full lobby state
          emit(EVENTS.ROOM_CREATED, {
            roomCode: joinedRoom.code,
            playerId: socket.id,
            joinUrl: `http://${ip}:${PORT}/?join=${joinedRoom.code}`,
            hostDisplayUrl: `http://${ip}:${PORT}/host/${joinedRoom.code}`,
          });
        } else {
          // In-game rejoin: send full game state
          const currentPlayer = engine.getCurrentPlayer(joinedRoom);
          emit(EVENTS.GAME_SYNC, {
            playerId: socket.id,
            roomCode: joinedRoom.code,
            phase: joinedRoom.phase,
            players: rooms.toPlayerInfoList(joinedRoom),
            hostId: joinedRoom.hostId,
            isHost: player.isHost,
            gameMode: joinedRoom.settings.gameMode,
            activePlayerId: currentPlayer?.id ?? null,
            activePlayerName: currentPlayer?.name ?? null,
            round: joinedRoom.round,
            totalSongs: joinedRoom.shuffledSongs.length,
            myTimeline: player.timeline.map(s => ({ id: s.id, title: s.title, artist: s.artist, year: s.year })),
            lastResult: joinedRoom.placingResult ? (() => {
              const syncIsProMode = joinedRoom.settings.gameMode === 'pro';
              const syncArtistTitleActive = syncIsProMode && joinedRoom.placingResult.correct && !!joinedRoom.artistTitleTimer;
              const syncBuzzActive = syncIsProMode && !joinedRoom.placingResult.correct && !!joinedRoom.buzzTimer;
              const syncHide = syncArtistTitleActive || syncBuzzActive;
              return {
                correct: joinedRoom.placingResult.correct,
                year: joinedRoom.placingResult.song.year,
                ...(!syncHide && {
                  title: joinedRoom.placingResult.song.title,
                  artist: joinedRoom.placingResult.song.artist,
                }),
                scores: engine.getScores(joinedRoom),
                placingPlayerId: joinedRoom.placingResult.placingPlayerId,
              };
            })() : null,
          });

          // Re-open artist/title guessing window if still active
          if (joinedRoom.artistTitleTimer && joinedRoom.artistTitleChoices) {
            emit(EVENTS.GAME_ARTIST_TITLE_OPEN, joinedRoom.artistTitleChoices);
          }
        }

        broadcast(joinedRoom.code, EVENTS.ROOM_UPDATED, {
          roomCode: joinedRoom.code,
          phase: joinedRoom.phase,
          players: rooms.toPlayerInfoList(joinedRoom),
          hostId: joinedRoom.hostId,
          settings: joinedRoom.settings,
          selectedPlaylistId: joinedRoom.selectedPlaylistId,
        });
        return;
      }

      // No existing player — only allowed in lobby
      if (joinedRoom.phase !== 'lobby') return emit(EVENTS.ROOM_ERROR, { message: 'Game already in progress' });

      const result = rooms.joinRoom(socket.id, roomCode, playerName);
      if ('error' in result) return emit(EVENTS.ROOM_ERROR, { message: result.error });
      const { room } = result;
      socket.join(room.code);
      emit(EVENTS.ROOM_CREATED, {
        roomCode: room.code,
        playerId: socket.id,
        joinUrl: `http://${getLocalIP()}:${PORT}/?join=${room.code}`,
        hostDisplayUrl: `http://${getLocalIP()}:${PORT}/host/${room.code}`,
      });
      broadcast(room.code, EVENTS.ROOM_UPDATED, {
        roomCode: room.code,
        phase: room.phase,
        players: rooms.toPlayerInfoList(room),
        hostId: room.hostId,
        settings: room.settings,
        selectedPlaylistId: room.selectedPlaylistId,
      });
    });

    socket.on(EVENTS.LOBBY_SELECT_PLAYLIST, ({ playlistId } = {}) => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (!playlists.getById(playlistId)) return emit(EVENTS.ROOM_ERROR, { message: 'Playlist not found' });
      room.selectedPlaylistId = playlistId;
      broadcast(room.code, EVENTS.ROOM_UPDATED, {
        roomCode: room.code,
        phase: room.phase,
        players: rooms.toPlayerInfoList(room),
        hostId: room.hostId,
        settings: room.settings,
        selectedPlaylistId: room.selectedPlaylistId,
      });
    });

    socket.on(EVENTS.LOBBY_START, async () => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
      if (!room.selectedPlaylistId) return emit(EVENTS.ROOM_ERROR, { message: 'Select a playlist first' });
      if (room.players.size < 1) return emit(EVENTS.ROOM_ERROR, { message: 'Need at least 1 player' });

      const playlist = playlists.getById(room.selectedPlaylistId);
      if (!playlist) return emit(EVENTS.ROOM_ERROR, { message: 'Playlist not found' });

      engine.startGame(room, playlist.songs);

      broadcast(room.code, EVENTS.GAME_STARTED, {
        playerOrder: room.playerOrder,
        totalSongs: room.shuffledSongs.length,
      });

      await startTurn(io, rooms, room.code);
    });

    // ─── Gameplay ─────────────────────────────────────────────────────────────

    socket.on(EVENTS.GAME_PLACE, async ({ position } = {}) => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.phase !== 'playing') return;
      const currentPlayer = engine.getCurrentPlayer(room);
      if (!currentPlayer || currentPlayer.id !== socket.id) return;
      if (typeof position !== 'number') return;

      room.phase = 'placing';
      const result = engine.validatePlacement(room, socket.id, position);
      const placingPlayer = room.players.get(socket.id);
      const activePlayerTimeline = placingPlayer?.timeline.map(s => ({ year: s.year, title: s.title, artist: s.artist })) ?? [];

      // Pre-fetch next song in background
      const nextSong = room.shuffledSongs[room.currentSongIndex + 1];
      if (nextSong) ytdlp.prefetch(nextSong.videoId);

      if (room.settings.gameMode === 'pro' && result.correct) {
        // Pro mode + correct placement: hide title/artist from result, open artist+title guessing phase
        broadcast(room.code, EVENTS.GAME_RESULT, {
          correct: result.correct,
          year: result.year,
          scores: result.scores,
          placingPlayerId: result.placingPlayerId,
          activePlayerTimeline,
          // title and artist intentionally omitted
        });
        const currentSong = engine.getCurrentSong(room)!;
        const atChoices = engine.generateArtistTitleChoices(currentSong, room.shuffledSongs);
        room.artistTitleChoices = atChoices;
        broadcast(room.code, EVENTS.GAME_ARTIST_TITLE_OPEN, atChoices);

        room.artistTitleTimer = setTimeout(() => {
          if (room.phase === 'placing') {
            // Time's up — reveal without bonus and advance
            const song = engine.getCurrentSong(room);
            broadcast(room.code, EVENTS.GAME_ARTIST_TITLE_RESULT, {
              title: song?.title ?? '',
              artist: song?.artist ?? '',
              artistCorrect: false,
              titleCorrect: false,
              scores: Object.fromEntries(
                Array.from(room.players.values()).map(p => [p.id, p.score])
              ),
              placingPlayerId: socket.id,
            });
            setTimeout(() => {
              if (room.phase === 'placing') finishTurn(io, rooms, engine, room.code);
            }, REVEAL_DURATION_MS);
          }
        }, ARTIST_TITLE_WINDOW_MS);
      } else if (room.settings.gameMode === 'pro' && !result.correct) {
        // Pro mode + wrong placement: hide title/artist until buzz phase ends, open buzz window
        broadcast(room.code, EVENTS.GAME_RESULT, {
          correct: result.correct,
          year: result.year,
          scores: result.scores,
          placingPlayerId: result.placingPlayerId,
          activePlayerTimeline,
          // title/artist intentionally omitted — revealed via GAME_ARTIST_RESULT
        });
        const buzzChoices = engine.generateBuzzChoices(engine.getCurrentSong(room)!, room.shuffledSongs);
        broadcast(room.code, EVENTS.GAME_BUZZ_OPEN, { buzzingPlayerId: null, artistChoices: buzzChoices });
        room.buzzTimer = setTimeout(() => {
          if (room.phase === 'placing') finishTurn(io, rooms, engine, room.code);
        }, BUZZ_WINDOW_MS);
      } else {
        // Classic mode (correct or wrong): broadcast full result and auto-advance after reveal
        broadcast(room.code, EVENTS.GAME_RESULT, { ...result, activePlayerTimeline });
        setTimeout(() => {
          if (room.phase === 'placing') finishTurn(io, rooms, engine, room.code);
        }, REVEAL_DURATION_MS);
      }
    });

    socket.on(EVENTS.GAME_BUZZ, () => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.phase !== 'placing' || room.settings.gameMode !== 'pro') return;
      const currentPlayer = engine.getCurrentPlayer(room);
      if (currentPlayer?.id === socket.id) return; // active player can't buzz
      if (room.buzzPlayerId) return; // already buzzed
      if (room.buzzTimer) { clearTimeout(room.buzzTimer); room.buzzTimer = null; }

      room.buzzPlayerId = socket.id;
      const buzzer = room.players.get(socket.id);
      const buzzSong = engine.getCurrentSong(room);
      const buzzArtistChoices = buzzSong ? engine.generateBuzzChoices(buzzSong, room.shuffledSongs) : [];
      broadcast(room.code, EVENTS.GAME_BUZZ_OPEN, {
        buzzingPlayerId: socket.id,
        buzzingPlayerName: buzzer?.name,
        artistChoices: buzzArtistChoices,
      });

      // Give buzzer 8 seconds to guess
      room.buzzTimer = setTimeout(() => {
        if (room.phase === 'placing') {
          const timedOutSong = engine.getCurrentSong(room);
          broadcast(room.code, EVENTS.GAME_ARTIST_RESULT, {
            correct: false,
            artist: '',
            buzzPlayerId: socket.id,
            buzzPlayerName: buzzer?.name,
            stole: false,
            songTitle: timedOutSong?.title,
            songArtist: timedOutSong?.artist,
          });
          finishTurn(io, rooms, engine, room.code);
        }
      }, BUZZ_WINDOW_MS);
    });

    socket.on(EVENTS.GAME_GUESS_ARTIST, ({ artist } = {}) => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.phase !== 'placing' || room.buzzPlayerId !== socket.id) return;
      if (room.buzzTimer) { clearTimeout(room.buzzTimer); room.buzzTimer = null; }

      const correct = engine.checkArtist(room, artist ?? '');
      const buzzer = room.players.get(socket.id);
      let stole = false;
      if (correct) {
        const { stole: didSteal } = engine.applyArtistSteal(room, socket.id);
        stole = didSteal;
      }

      const guessedSong = engine.getCurrentSong(room);
      broadcast(room.code, EVENTS.GAME_ARTIST_RESULT, {
        correct,
        artist: artist ?? '',
        buzzPlayerId: socket.id,
        buzzPlayerName: buzzer?.name,
        stole,
        scores: engine.getScores(room),
        songTitle: guessedSong?.title,
        songArtist: guessedSong?.artist,
      });

      setTimeout(() => {
        if (room.phase === 'placing') finishTurn(io, rooms, engine, room.code);
      }, REVEAL_DURATION_MS);
    });

    socket.on(EVENTS.GAME_GUESS_ARTIST_TITLE, ({ artist, title } = {}) => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.phase !== 'placing' || room.settings.gameMode !== 'pro') return;
      const currentPlayer = engine.getCurrentPlayer(room);
      if (!currentPlayer || currentPlayer.id !== socket.id) return; // only the active player
      if (room.artistTitleTimer) { clearTimeout(room.artistTitleTimer); room.artistTitleTimer = null; }

      const artistCorrect = engine.checkArtist(room, artist ?? '');
      const titleCorrect = engine.checkTitle(room, title ?? '');
      engine.applyArtistTitleBonus(room, socket.id, artistCorrect, titleCorrect);

      const song = engine.getCurrentSong(room);
      broadcast(room.code, EVENTS.GAME_ARTIST_TITLE_RESULT, {
        title: song?.title ?? '',
        artist: song?.artist ?? '',
        artistCorrect,
        titleCorrect,
        scores: Object.fromEntries(
          Array.from(room.players.values()).map(p => [p.id, p.score])
        ),
        placingPlayerId: socket.id,
      });

      setTimeout(() => {
        if (room.phase === 'placing') finishTurn(io, rooms, engine, room.code);
      }, REVEAL_DURATION_MS);
    });

    socket.on(EVENTS.GAME_NEXT, () => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (room.phase !== 'placing' && room.phase !== 'revealing') return;
      if (room.artistTitleTimer) { clearTimeout(room.artistTitleTimer); room.artistTitleTimer = null; }
      finishTurn(io, rooms, engine, room.code);
    });

    socket.on(EVENTS.GAME_PLAY_AGAIN, () => {
      const room = rooms.getBySocket(socket.id);
      if (!room || room.hostId !== socket.id) return;
      room.phase = 'lobby';
      room.shuffledSongs = [];
      room.currentSongIndex = 0;
      room.currentPlayerIndex = 0;
      room.round = 1;
      room.buzzPlayerId = null;
      if (room.buzzTimer) { clearTimeout(room.buzzTimer); room.buzzTimer = null; }
      if (room.artistTitleTimer) { clearTimeout(room.artistTitleTimer); room.artistTitleTimer = null; }
      room.artistTitleChoices = null;
      room.placingResult = null;
      for (const p of room.players.values()) { p.score = 0; p.timeline = []; }
      broadcast(room.code, EVENTS.ROOM_UPDATED, {
        roomCode: room.code,
        phase: room.phase,
        players: rooms.toPlayerInfoList(room),
        hostId: room.hostId,
        settings: room.settings,
        selectedPlaylistId: room.selectedPlaylistId,
      });
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      const room = rooms.markDisconnected(socket.id);
      if (!room) return;
      broadcast(room.code, EVENTS.ROOM_UPDATED, {
        roomCode: room.code,
        phase: room.phase,
        players: rooms.toPlayerInfoList(room),
        hostId: room.hostId,
        settings: room.settings,
        selectedPlaylistId: room.selectedPlaylistId,
      });
    });
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function startTurn(io: Server, rooms: RoomManager, roomCode: string, attempt = 0) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;

  const song = new GameEngine().getCurrentSong(room);
  if (!song) return;

  // Pre-validate that yt-dlp can fetch this song; skip if unavailable (max 3 skips)
  console.log(`[turn] ${room.round}/${room.shuffledSongs.length} — "${song.title}" (${song.videoId})`);
  try {
    await ytdlp.getAudioUrl(song.videoId);
  } catch {
    console.warn(`[skip] Song unavailable: ${song.title} (${song.videoId})`);
    if (attempt >= 3) {
      io.to(roomCode).emit(EVENTS.GAME_OVER, {
        winner: null,
        scores: new GameEngine().getScores(room),
      });
      return;
    }
    new GameEngine().advanceTurn(room);
    return startTurn(io, rooms, roomCode, attempt + 1);
  }

  const streamUrl = `/api/stream/${song.videoId}`;
  const currentPlayer = new GameEngine().getCurrentPlayer(room);
  const activePlayer = currentPlayer ? room.players.get(currentPlayer.id) : null;
  const activePlayerTimeline = activePlayer?.timeline.map(s => ({ year: s.year, title: s.title, artist: s.artist })) ?? [];

  // Pre-fetch next song in background
  const nextSong = room.shuffledSongs[room.currentSongIndex + 1];
  if (nextSong) ytdlp.prefetch(nextSong.videoId);

  io.to(roomCode).emit(EVENTS.GAME_TURN, {
    activePlayerId: currentPlayer?.id,
    activePlayerName: currentPlayer?.name,
    round: room.round,
    totalSongs: room.shuffledSongs.length,
    streamUrl,
    activePlayerTimeline,
  });
}

function finishTurn(io: Server, rooms: RoomManager, engine: GameEngine, roomCode: string) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;

  const winner = engine.checkWinner(room);
  if (winner) {
    room.phase = 'finished';
    io.to(roomCode).emit(EVENTS.GAME_OVER, {
      winner: { id: winner.id, name: winner.name, score: winner.score },
      scores: engine.getScores(room),
    });
    return;
  }

  const state = engine.advanceTurn(room);
  if (state === 'finished') {
    const leader = engine.getLeader(room);
    io.to(roomCode).emit(EVENTS.GAME_OVER, {
      winner: leader ? { id: leader.id, name: leader.name, score: leader.score } : null,
      scores: engine.getScores(room),
    });
    return;
  }

  startTurn(io, rooms, roomCode);
}
