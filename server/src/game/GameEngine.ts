import type { Room, Player } from './types.js';
import type { Song, PlayerScore, PlacementResult, ArtistTitleChoices } from '../../../src/types/index.js';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class GameEngine {
  startGame(room: Room, songs: Song[]): void {
    room.phase = 'playing';
    room.shuffledSongs = shuffle(songs);
    room.currentSongIndex = 0;
    room.currentPlayerIndex = 0;
    room.round = 1;
    // Reset player state
    for (const player of room.players.values()) {
      player.score = 0;
      player.timeline = [];
    }
    // Randomize turn order
    room.playerOrder = shuffle(room.playerOrder);
  }

  getCurrentSong(room: Room): Song | null {
    return room.shuffledSongs[room.currentSongIndex] ?? null;
  }

  getCurrentPlayer(room: Room): Player | undefined {
    const id = room.playerOrder[room.currentPlayerIndex];
    return room.players.get(id);
  }

  validatePlacement(room: Room, playerId: string, position: number): PlacementResult {
    const song = this.getCurrentSong(room)!;
    const player = room.players.get(playerId)!;
    const timeline = player.timeline; // sorted by year

    const leftYear = position > 0 ? timeline[position - 1].year : -Infinity;
    const rightYear = position < timeline.length ? timeline[position].year : Infinity;
    const correct = song.year >= leftYear && song.year <= rightYear;

    if (correct) {
      timeline.splice(position, 0, song);
      player.score += 1;
    }

    room.placingResult = { correct, song, placingPlayerId: playerId };

    return {
      correct,
      year: song.year,
      title: song.title,
      artist: song.artist,
      scores: this.getScores(room),
      placingPlayerId: playerId,
    };
  }

  applyArtistSteal(room: Room, buzzPlayerId: string): { stole: boolean } {
    const result = room.placingResult;
    if (!result || result.correct) return { stole: false };

    // Active player placed wrong — buzz player steals the card
    const stealer = room.players.get(buzzPlayerId);
    if (!stealer) return { stole: false };

    stealer.timeline.push(result.song);
    stealer.timeline.sort((a, b) => a.year - b.year);
    stealer.score += 1;
    return { stole: true };
  }

  checkWinner(room: Room): Player | null {
    for (const player of room.players.values()) {
      if (player.score >= room.settings.winScore) return player;
    }
    return null;
  }

  advanceTurn(room: Room): 'playing' | 'finished' {
    room.currentSongIndex += 1;
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.playerOrder.length;
    room.round += 1;
    room.buzzPlayerId = null;
    room.placingResult = null;
    if (room.buzzTimer) { clearTimeout(room.buzzTimer); room.buzzTimer = null; }
    if (room.artistTitleTimer) { clearTimeout(room.artistTitleTimer); room.artistTitleTimer = null; }
    room.artistTitleChoices = null;

    if (room.currentSongIndex >= room.shuffledSongs.length) {
      room.phase = 'finished';
      return 'finished';
    }

    room.phase = 'playing';
    return 'playing';
  }

  getScores(room: Room): PlayerScore[] {
    return Array.from(room.players.values())
      .map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color }))
      .sort((a, b) => b.score - a.score);
  }

  getLeader(room: Room): Player | undefined {
    return [...room.players.values()].sort((a, b) => b.score - a.score)[0];
  }

  normalizeArtist(name: string): string {
    return name
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  normalizeTitle(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  checkArtist(room: Room, guess: string): boolean {
    const song = this.getCurrentSong(room);
    if (!song) return false;
    return this.normalizeArtist(guess) === this.normalizeArtist(song.artist);
  }

  checkTitle(room: Room, guess: string): boolean {
    const song = this.getCurrentSong(room);
    if (!song) return false;
    return this.normalizeTitle(guess) === this.normalizeTitle(song.title);
  }

  generateArtistTitleChoices(song: Song, allSongs: Song[]): ArtistTitleChoices {
    const wrongArtists = song.wrongArtists && song.wrongArtists.length >= 2
      ? song.wrongArtists.slice(0, 2)
      : this.pickRandomDistractors(song.artist, allSongs.map(s => s.artist), 2);
    const wrongTitles = song.wrongTitles && song.wrongTitles.length >= 2
      ? song.wrongTitles.slice(0, 2)
      : this.pickRandomDistractors(song.title, allSongs.map(s => s.title), 2);

    return {
      artistChoices: shuffle([song.artist, ...wrongArtists]),
      titleChoices: shuffle([song.title, ...wrongTitles]),
    };
  }

  generateBuzzChoices(song: Song, allSongs: Song[]): string[] {
    const wrongArtists = song.wrongArtists && song.wrongArtists.length >= 2
      ? song.wrongArtists.slice(0, 2)
      : this.pickRandomDistractors(song.artist, allSongs.map(s => s.artist), 2);

    return shuffle([song.artist, ...wrongArtists]);
  }

  private pickRandomDistractors(correct: string, pool: string[], count: number): string[] {
    const unique = [...new Set(pool)].filter(x => x !== correct);
    const shuffled = shuffle(unique);
    return shuffled.slice(0, count);
  }

  applyArtistTitleBonus(room: Room, playerId: string, artistCorrect: boolean, titleCorrect: boolean): void {
    const player = room.players.get(playerId);
    if (!player) return;
    const song = this.getCurrentSong(room);
    if (!song) return;

    if (artistCorrect) player.score += 1;
    if (titleCorrect) player.score += 1;

    // If at least one guess is correct, add the card to the player's timeline
    // (placement was already correct — card was added in validatePlacement;
    //  artist/title bonus does NOT add it again, just grants extra score points)
  }
}
