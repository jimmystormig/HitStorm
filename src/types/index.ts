// ─── Playlist ───────────────────────────────────────────────────────────────

export interface Song {
  id: string;
  title: string;
  artist: string;
  year: number;
  videoId: string;
}

export interface PlaylistMeta {
  id: string;
  name: string;
  description: string;
  songCount: number;
}

// ─── Players ─────────────────────────────────────────────────────────────────

export interface PlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  timelineLength: number;
  connected: boolean;
  color: string; // deterministic avatar color
}

export interface PlayerScore {
  id: string;
  name: string;
  score: number;
  color: string;
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export type GameMode = 'classic' | 'pro';
export type GamePhase = 'lobby' | 'playing' | 'placing' | 'revealing' | 'finished';

export interface GameSettings {
  winScore: number;
  gameMode: GameMode;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  phase: GamePhase;
  players: PlayerInfo[];
  settings: GameSettings;
  selectedPlaylistId: string | null;
  round: number;
  totalSongs: number;
  activePlayerId: string | null;
}

// ─── Turn ─────────────────────────────────────────────────────────────────────

export interface TurnData {
  activePlayerId: string;
  round: number;
  totalSongs: number;
  streamUrl: string; // the /api/stream/:videoId URL for Host Display to play
}

export interface PlacementResult {
  correct: boolean;
  year: number;
  title: string;
  artist: string;
  scores: PlayerScore[];
  placingPlayerId: string;
}

export interface ArtistResult {
  correct: boolean;
  artist: string;
  buzzPlayerId: string;
  buzzPlayerName: string;
  stole: boolean; // stole the card from the active player
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineCard {
  id: string;
  title: string;
  artist: string;
  year: number;
}

// ─── Socket events ────────────────────────────────────────────────────────────

export const EVENTS = {
  // Client -> Server
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  LOBBY_SELECT_PLAYLIST: 'lobby:selectPlaylist',
  LOBBY_START: 'lobby:start',
  GAME_PLACE: 'game:place',
  GAME_BUZZ: 'game:buzz',
  GAME_GUESS_ARTIST: 'game:guessArtist',
  GAME_NEXT: 'game:next',
  GAME_PLAY_AGAIN: 'game:playAgain',

  // Server -> Client
  ROOM_CREATED: 'room:created',
  ROOM_UPDATED: 'room:updated',
  ROOM_ERROR: 'room:error',
  GAME_STARTED: 'game:started',
  GAME_TURN: 'game:turn',
  GAME_RESULT: 'game:result',
  GAME_BUZZ_OPEN: 'game:buzzOpen',
  GAME_ARTIST_RESULT: 'game:artistResult',
  GAME_OVER: 'game:over',
  GAME_SYNC: 'game:sync',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
