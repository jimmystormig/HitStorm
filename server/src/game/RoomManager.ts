import type { Room, Player } from './types.js';
import type { GameMode } from '../../../src/types/index.js';
import { generateRoomCode, assignColor } from './roomCode.js';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>(); // socketId -> roomCode

  createRoom(socketId: string, playerName: string, gameMode: GameMode = 'classic', winScore = 10): Room {
    let code: string;
    do { code = generateRoomCode(); } while (this.rooms.has(code));

    const playerId = socketId;
    const player: Player = {
      id: playerId,
      socketId,
      name: playerName.trim().slice(0, 20),
      isHost: true,
      score: 0,
      timeline: [],
      connected: true,
      color: assignColor(0),
    };

    const room: Room = {
      code,
      hostId: playerId,
      phase: 'lobby',
      players: new Map([[playerId, player]]),
      playerOrder: [playerId],
      settings: { winScore, gameMode },
      selectedPlaylistId: null,
      shuffledSongs: [],
      currentSongIndex: 0,
      currentPlayerIndex: 0,
      round: 1,
      buzzPlayerId: null,
      buzzTimer: null,
      artistTitleTimer: null,
      placingResult: null,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    return room;
  }

  joinRoom(socketId: string, code: string, playerName: string): { room: Room; player: Player } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.phase !== 'lobby') return { error: 'Game already in progress' };
    if (room.players.size >= 8) return { error: 'Room is full (max 8 players)' };

    const colorIndex = room.players.size;
    const player: Player = {
      id: socketId,
      socketId,
      name: playerName.trim().slice(0, 20),
      isHost: false,
      score: 0,
      timeline: [],
      connected: true,
      color: assignColor(colorIndex),
    };

    room.players.set(socketId, player);
    room.playerOrder.push(socketId);
    this.socketToRoom.set(socketId, code);
    return { room, player };
  }

  leaveRoom(socketId: string): { room: Room; wasHost: boolean } | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;

    const wasHost = room.hostId === socketId;
    room.players.delete(socketId);
    room.playerOrder = room.playerOrder.filter(id => id !== socketId);
    this.socketToRoom.delete(socketId);

    if (room.players.size === 0) {
      if (room.buzzTimer) clearTimeout(room.buzzTimer);
      if (room.artistTitleTimer) clearTimeout(room.artistTitleTimer);
      this.rooms.delete(code);
      return { room, wasHost };
    }

    // Transfer host
    if (wasHost && room.playerOrder.length > 0) {
      const newHostId = room.playerOrder[0];
      room.hostId = newHostId;
      const newHost = room.players.get(newHostId);
      if (newHost) newHost.isHost = true;
    }

    return { room, wasHost };
  }

  markDisconnected(socketId: string): Room | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = room.players.get(socketId);
    if (player) player.connected = false;
    return room;
  }

  getBySocket(socketId: string): Room | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  rejoinPlayer(oldSocketId: string, newSocketId: string, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(oldSocketId);
    if (!player) return;

    player.id = newSocketId;
    player.socketId = newSocketId;
    player.connected = true;

    room.players.delete(oldSocketId);
    room.players.set(newSocketId, player);

    const idx = room.playerOrder.indexOf(oldSocketId);
    if (idx !== -1) room.playerOrder[idx] = newSocketId;

    if (room.hostId === oldSocketId) room.hostId = newSocketId;

    this.socketToRoom.delete(oldSocketId);
    this.socketToRoom.set(newSocketId, roomCode);
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getPlayers(room: Room) {
    return Array.from(room.players.values());
  }

  toPlayerInfoList(room: Room) {
    return Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      score: p.score,
      timelineLength: p.timeline.length,
      connected: p.connected,
      color: p.color,
    }));
  }
}
