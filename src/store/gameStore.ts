import { create } from 'zustand';
import type { PlayerInfo, PlayerScore, PlacementResult, ArtistResult, ArtistTitleResult, GameMode } from '../types';

interface GameStore {
  // Connection / identity
  connected: boolean;
  playerId: string | null;
  playerName: string | null;
  isHost: boolean;

  // Room
  roomCode: string | null;
  joinUrl: string | null;
  hostDisplayUrl: string | null;
  phase: 'home' | 'lobby' | 'playing' | 'placing' | 'finished';
  players: PlayerInfo[];
  hostId: string | null;
  selectedPlaylistId: string | null;
  gameMode: GameMode;

  // Game
  activePlayerId: string | null;
  activePlayerName: string | null;
  round: number;
  totalSongs: number;
  streamUrl: string | null;
  myTimeline: import('../types').TimelineCard[];

  // Results
  lastResult: PlacementResult | null;
  artistResult: ArtistResult | null;
  finalScores: PlayerScore[];
  winner: { id: string; name: string; score: number } | null;

  // Pro mode
  buzzingPlayerId: string | null;
  buzzingPlayerName: string | null;
  iAmBuzzing: boolean;
  artistTitleOpen: boolean;
  artistTitleResult: ArtistTitleResult | null;

  // Actions
  setIdentity: (id: string, name: string, isHost: boolean) => void;
  setRoom: (code: string, joinUrl: string, hostDisplayUrl: string, hostId: string) => void;
  setPlayers: (players: PlayerInfo[], hostId: string) => void;
  setSelectedPlaylist: (id: string | null) => void;
  setPhase: (phase: GameStore['phase']) => void;
  setTurn: (activePlayerId: string, activePlayerName: string, round: number, totalSongs: number, streamUrl: string) => void;
  addToTimeline: (card: import('../types').TimelineCard) => void;
  setLastResult: (r: PlacementResult | null) => void;
  setBuzzOpen: (buzzingPlayerId: string | null, buzzingPlayerName: string | null) => void;
  setArtistResult: (r: ArtistResult | null) => void;
  setArtistTitleOpen: (open: boolean) => void;
  setArtistTitleResult: (r: ArtistTitleResult) => void;
  setGameOver: (winner: GameStore['winner'], scores: PlayerScore[]) => void;
  setGameMode: (mode: GameMode) => void;
  reset: () => void;
}

const initial = {
  connected: true,
  playerId: null,
  playerName: null,
  isHost: false,
  roomCode: null,
  joinUrl: null,
  hostDisplayUrl: null,
  phase: 'home' as const,
  players: [],
  hostId: null,
  selectedPlaylistId: null,
  gameMode: 'classic' as GameMode,
  activePlayerId: null,
  activePlayerName: null,
  round: 1,
  totalSongs: 0,
  streamUrl: null,
  myTimeline: [],
  lastResult: null,
  artistResult: null,
  finalScores: [],
  winner: null,
  buzzingPlayerId: null,
  buzzingPlayerName: null,
  iAmBuzzing: false,
  artistTitleOpen: false,
  artistTitleResult: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initial,

  setIdentity: (id, name, isHost) => set({ playerId: id, playerName: name, isHost }),

  setRoom: (code, joinUrl, hostDisplayUrl, hostId) =>
    set({ roomCode: code, joinUrl, hostDisplayUrl, hostId, phase: 'lobby' }),

  setPlayers: (players, hostId) => set({ players, hostId }),

  setSelectedPlaylist: (id) => set({ selectedPlaylistId: id }),

  setPhase: (phase) => set({ phase }),

  setTurn: (activePlayerId, activePlayerName, round, totalSongs, streamUrl) =>
    set({
      activePlayerId,
      activePlayerName,
      round,
      totalSongs,
      streamUrl,
      phase: 'playing',
      lastResult: null,
      artistResult: null,
      buzzingPlayerId: null,
      buzzingPlayerName: null,
      iAmBuzzing: false,
      artistTitleOpen: false,
      artistTitleResult: null,
    }),

  addToTimeline: (card) =>
    set(s => ({
      myTimeline: [...s.myTimeline, card].sort((a, b) => a.year - b.year),
    })),

  setLastResult: (r) => {
    set(state => ({
      lastResult: r,
      phase: 'placing',
      // Keep player scores in sync without waiting for ROOM_UPDATED
      players: r?.scores
        ? state.players.map(p => {
            const s = r.scores.find((x: PlayerScore) => x.id === p.id);
            return s ? { ...p, score: s.score } : p;
          })
        : state.players,
    }));
    // Only add to timeline when title is present (Classic mode path).
    // In Pro mode with a correct placement, title is omitted until artistTitleResult arrives.
    if (r?.correct && r.placingPlayerId === get().playerId && r.title !== undefined && r.artist !== undefined) {
      get().addToTimeline({ id: r.placingPlayerId + r.year, title: r.title, artist: r.artist, year: r.year });
    }
  },

  setBuzzOpen: (buzzingPlayerId, buzzingPlayerName) =>
    set({ buzzingPlayerId, buzzingPlayerName, iAmBuzzing: buzzingPlayerId === get().playerId }),

  setArtistResult: (r) => {
    set({ artistResult: r });
    if (r?.stole && r.buzzPlayerId === get().playerId) {
      // We stole the card — add to our timeline
      // The server handles score; we update local timeline optimistically via result data
    }
  },

  setArtistTitleOpen: (open) => set({ artistTitleOpen: open }),

  setArtistTitleResult: (r) => {
    set(state => ({
      artistTitleResult: r,
      artistTitleOpen: false,
      // Update player scores from the result
      players: state.players.map(p => {
        const newScore = r.scores[p.id];
        return newScore !== undefined ? { ...p, score: newScore } : p;
      }),
    }));
    // If we are the placing player, add the card to our timeline now that title/artist are known
    const { playerId, lastResult } = get();
    if (r.placingPlayerId === playerId && lastResult?.correct && lastResult.year !== undefined) {
      get().addToTimeline({
        id: r.placingPlayerId + lastResult.year,
        title: r.title,
        artist: r.artist,
        year: lastResult.year,
      });
    }
  },

  setGameOver: (winner, scores) =>
    set({ winner, finalScores: scores, phase: 'finished' }),

  setGameMode: (mode) => set({ gameMode: mode }),

  reset: () => set(initial),
}));
