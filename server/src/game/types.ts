import type { Song, GameMode, GamePhase, PlayerScore } from '../../../src/types/index.js';

export interface Player {
  id: string;
  socketId: string;
  name: string;
  isHost: boolean;
  score: number;
  timeline: Song[]; // sorted by year, songs correctly placed
  connected: boolean;
  color: string;
}

export interface Room {
  code: string;
  hostId: string;
  phase: GamePhase;
  players: Map<string, Player>;
  playerOrder: string[]; // player ids in turn order
  settings: { winScore: number; gameMode: GameMode };
  selectedPlaylistId: string | null;

  // game state (set when game starts)
  shuffledSongs: Song[];
  currentSongIndex: number;
  currentPlayerIndex: number;
  round: number;

  // pro mode state
  buzzPlayerId: string | null;
  buzzTimer: ReturnType<typeof setTimeout> | null;
  artistTitleTimer: ReturnType<typeof setTimeout> | null;
  artistTitleChoices: { artistChoices: string[]; titleChoices: string[] } | null;
  placingResult: PlacingResult | null;
}

export interface PlacingResult {
  correct: boolean;
  song: Song;
  placingPlayerId: string;
}

export { PlayerScore };
