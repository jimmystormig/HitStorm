import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { EVENTS } from '../types';
import { useGameStore } from '../store/gameStore';

const SESSION_KEY = 'hitstorm_session';

function saveSession(roomCode: string, playerName: string) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerName })); } catch {}
}
function loadSession(): { roomCode: string; playerName: string } | null {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      reconnectionAttempts: Infinity,
    });
  }
  return socketInstance;
}

function tryRejoinRoom(socket: Socket) {
  const state = useGameStore.getState();
  // Fall back to localStorage when Zustand resets (page reload / navigation)
  const roomCode = state.roomCode ?? loadSession()?.roomCode;
  const playerName = state.playerName ?? loadSession()?.playerName;
  console.log(`[useSocket] tryRejoinRoom: roomCode=${roomCode}, playerName=${playerName}`);
  if (roomCode && playerName) {
    socket.emit(EVENTS.ROOM_JOIN, { roomCode, playerName });
  }
}

export function forceReconnect() {
  const socket = getSocket();
  if (socket.io.engine) {
    socket.io.engine.close();
  } else {
    socket.connect();
  }
}

// Expose for E2E tests — allows test to simulate iOS lock (disconnect + rejoin)
if (typeof window !== 'undefined') {
  (window as any).__hitstorm_closeEngine = () => {
    const s = getSocket();
    // Use engine.close() to simulate transport failure (iOS lock behaviour)
    if (s.io.engine) {
      s.io.engine.close();
    } else {
      s.disconnect();
      setTimeout(() => s.connect(), 100);
    }
  };
  (window as any).__hitstorm_forceReconnect = () => {
    const s = getSocket();
    // Fallback: explicit disconnect + reconnect for testing
    s.disconnect();
    setTimeout(() => s.connect(), 200);
  };
  (window as any).__hitstorm_storeState = () => {
    const state = useGameStore.getState();
    const s = getSocket();
    return {
      roomCode: state.roomCode,
      playerName: state.playerName,
      connected: state.connected,
      socketConnected: s.connected,
      phase: state.phase,
    };
  };
}

let pingTimeout: ReturnType<typeof setTimeout> | null = null;

function checkConnection() {
  const hasSession = !!(useGameStore.getState().roomCode ?? loadSession()?.roomCode);
  if (!hasSession) return;

  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
    return;
  }

  if (pingTimeout) return; // Already checking

  pingTimeout = setTimeout(() => {
    pingTimeout = null;
    forceReconnect();
  }, 1500);

  socket.emit('ping_check');
  socket.once('pong_check', () => {
    if (pingTimeout) {
      clearTimeout(pingTimeout);
      pingTimeout = null;
    }
  });
}

export function useSocket() {
  const store = useGameStore();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    const socket = getSocket();

    // Track connected state in store (single source of truth)
    socket.on('connect', () => {
      useGameStore.setState({ connected: true });
      tryRejoinRoom(socket);
    });
    socket.on('disconnect', () => {
      useGameStore.setState({ connected: false });
    });

    const visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      checkConnection();
    };

    // pageshow fires on bfcache restore — JS context may be fresh, socket is definitely dead.
    const pageshowHandler = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const hasSession = !!(useGameStore.getState().roomCode ?? loadSession()?.roomCode);
      if (hasSession) forceReconnect();
    };

    // online fires when the network interface comes back (Wi-Fi reconnect, airplane mode off).
    const onlineHandler = () => checkConnection();

    // focus: safe now — just probes, no unconditional reconnect.
    const focusHandler = () => checkConnection();

    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('pageshow', pageshowHandler);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('focus', focusHandler);

    // Heartbeat fallback: catches cases where visibility events don't fire (e.g. iOS).
    const heartbeat = setInterval(() => {
      const hasSession = !!(useGameStore.getState().roomCode ?? loadSession()?.roomCode);
      if (hasSession && !getSocket().connected) socket.connect();
    }, 5_000);

    socket.on(EVENTS.GAME_SYNC, (data) => {
      const pn = useGameStore.getState().playerName ?? loadSession()?.playerName;
      if (data.roomCode && pn) saveSession(data.roomCode, pn);
      const restoredName = useGameStore.getState().playerName ?? loadSession()?.playerName ?? '';
      useGameStore.setState({
        playerId: data.playerId,
        playerName: restoredName,
        roomCode: data.roomCode,
        isHost: data.isHost,
        players: data.players,
        hostId: data.hostId,
        gameMode: data.gameMode,
        activePlayerId: data.activePlayerId,
        activePlayerName: data.activePlayerName,
        round: data.round,
        totalSongs: data.totalSongs,
        phase: data.phase === 'placing' ? 'placing' : 'playing',
        myTimeline: data.myTimeline ?? [],
        lastResult: data.lastResult ?? null,
        buzzingPlayerId: null,
        buzzingPlayerName: null,
        iAmBuzzing: false,
        artistResult: null,
      });
    });

    socket.on(EVENTS.ROOM_CREATED, ({ roomCode, playerId, joinUrl, hostDisplayUrl }) => {
      const { playerName, isHost } = useGameStore.getState();
      useGameStore.getState().setIdentity(playerId, playerName ?? '', isHost);
      useGameStore.getState().setRoom(roomCode, joinUrl, hostDisplayUrl, playerId);
      if (playerName) saveSession(roomCode, playerName);
    });

    socket.on(EVENTS.ROOM_UPDATED, ({ players, hostId, selectedPlaylistId, phase, settings }) => {
      const s = useGameStore.getState();
      s.setPlayers(players, hostId);
      if (selectedPlaylistId !== undefined) s.setSelectedPlaylist(selectedPlaylistId);
      if (settings?.gameMode) s.setGameMode(settings.gameMode);
      const me = players.find((p: { id: string }) => p.id === s.playerId);
      if (me) s.setIdentity(s.playerId!, s.playerName!, me.isHost);
      if (phase === 'lobby') s.setPhase('lobby');
    });

    // Global ROOM_ERROR: if the room vanished (server restart, expiry), reset to home.
    // Page-local errors (name required, full room, etc.) are also caught here but only
    // act when we're already in a session — harmless for fresh joins.
    socket.on(EVENTS.ROOM_ERROR, ({ message }: { message: string }) => {
      if (message === 'Room not found' && useGameStore.getState().phase !== 'home') {
        clearSession();
        useGameStore.getState().reset();
      }
    });

    socket.on(EVENTS.GAME_STARTED, ({ totalSongs }) => {
      useGameStore.setState({ totalSongs, myTimeline: [] });
    });

    socket.on(EVENTS.GAME_TURN, ({ activePlayerId, activePlayerName, round, totalSongs, streamUrl }) => {
      useGameStore.getState().setTurn(activePlayerId, activePlayerName, round, totalSongs, streamUrl);
    });

    socket.on(EVENTS.GAME_RESULT, (result) => {
      useGameStore.getState().setLastResult(result);
    });

    socket.on(EVENTS.GAME_BUZZ_OPEN, ({ buzzingPlayerId, buzzingPlayerName }) => {
      useGameStore.getState().setBuzzOpen(buzzingPlayerId, buzzingPlayerName ?? null);
    });

    socket.on(EVENTS.GAME_ARTIST_RESULT, (result) => {
      useGameStore.getState().setArtistResult(result);
    });

    socket.on(EVENTS.GAME_OVER, ({ winner, scores }) => {
      useGameStore.getState().setGameOver(winner, scores);
      clearSession();
    });

    return () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.removeEventListener('pageshow', pageshowHandler);
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('focus', focusHandler);
      clearInterval(heartbeat);
      if (pingTimeout) { clearTimeout(pingTimeout); pingTimeout = null; }
    };
  }, []);

  return getSocket();
}

export function emit(event: string, data?: unknown) {
  getSocket().emit(event, data);
}
