import { useState, useEffect } from 'react';
import { emit } from '../hooks/useSocket';
import { EVENTS } from '../types';
import { useGameStore } from '../store/gameStore';

function Timeline({ cards, onPlace, isActive }: {
  cards: { id: string; title: string; artist: string; year: number }[];
  onPlace: (pos: number) => void;
  isActive: boolean;
}) {
  const isEmpty = cards.length === 0;

  if (isEmpty && isActive) {
    // First ever card — only one spot, make it obvious
    return (
      <div className="flex items-center justify-center py-4 px-4 min-h-[120px]">
        <button
          onClick={() => onPlace(0)}
          className="flex flex-col items-center gap-2 px-8 py-4 bg-white/20 border-2 border-dashed border-white rounded-2xl active:scale-95 transition-transform w-full max-w-xs"
        >
          <span className="text-2xl">🎵</span>
          <span className="text-white font-semibold text-sm text-center">
            Tap to place your first song
          </span>
          <span className="text-brand-100 text-xs text-center">
            First card is always free — the challenge grows!
          </span>
        </button>
      </div>
    );
  }

  if (isEmpty && !isActive) {
    return (
      <div className="flex items-center justify-center py-4 min-h-[120px]">
        <p className="text-brand-100/60 text-sm">Your timeline will grow here</p>
      </div>
    );
  }

  return (
    <div className="flex items-center overflow-x-auto scrollbar-hide py-4 px-4 min-h-[120px]">
      <Slot pos={0} onPlace={onPlace} isActive={isActive} first />
      {cards.map((card, i) => (
        <div key={card.id} className="flex items-center flex-shrink-0">
          <div className="bg-white text-brand-900 rounded-xl p-3 w-28 shadow-lg flex-shrink-0">
            <p className="font-bold text-lg text-center">{card.year}</p>
            <p className="text-xs text-center truncate text-brand-700 mt-0.5">{card.artist}</p>
            <p className="text-xs text-center truncate text-brand-900 font-medium">{card.title}</p>
          </div>
          <Slot pos={i + 1} onPlace={onPlace} isActive={isActive} />
        </div>
      ))}
    </div>
  );
}

function Slot({ pos, onPlace, isActive, first }: {
  pos: number; onPlace: (pos: number) => void; isActive: boolean; first?: boolean;
}) {
  return (
    <button
      onClick={() => isActive && onPlace(pos)}
      disabled={!isActive}
      className={`flex-shrink-0 rounded-xl transition-all mx-1 flex flex-col items-center justify-center gap-1 ${
        isActive
          ? 'w-14 h-20 bg-white/20 border-2 border-dashed border-white/70 active:scale-95'
          : 'w-2 h-16 bg-white/10 rounded-full'
      }`}
      aria-label={isActive ? `Place here` : undefined}
    >
      {isActive && (
        <>
          <span className="text-white text-lg leading-none">↓</span>
          <span className="text-white/60 text-[9px] leading-none">here</span>
        </>
      )}
    </button>
  );
}

export default function GamePage() {
  const {
    connected,
    playerId, activePlayerId, activePlayerName,
    round, totalSongs, myTimeline,
    lastResult, artistResult,
    buzzingPlayerId, buzzingPlayerName, iAmBuzzing,
    gameMode, players, isHost,
  } = useGameStore();

  const [artistGuess, setArtistGuess] = useState('');
  const [buzzTimeout, setBuzzTimeout] = useState(false);

  const isMyTurn = playerId === activePlayerId;
  const isOtherPlayersTurn = !isMyTurn;
  const showBuzzButton = gameMode === 'pro' && isOtherPlayersTurn && lastResult && !lastResult.correct && !buzzingPlayerId;
  const canTypeArtist = iAmBuzzing && !artistResult;

  // Reset state on new turn
  useEffect(() => {
    setArtistGuess('');
    setBuzzTimeout(false);
  }, [round]);

  const handlePlace = (position: number) => {
    emit(EVENTS.GAME_PLACE, { position });
  };

  const handleBuzz = () => {
    emit(EVENTS.GAME_BUZZ);
  };

  const handleArtistGuess = () => {
    if (!artistGuess.trim()) return;
    emit(EVENTS.GAME_GUESS_ARTIST, { artist: artistGuess.trim() });
    setArtistGuess('');
  };

  return (
    <div className="h-full flex flex-col safe-top safe-bottom">
      {/* Disconnection indicator — visible without scrolling */}
      {!connected && (
        <div className="bg-red-600 text-white text-center py-2 text-sm font-medium animate-pulse">
          Reconnecting…
        </div>
      )}
      {/* Header: round + whose turn */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-brand-100 text-xs uppercase tracking-wider">Round</p>
          <p className="text-white font-bold text-xl">{round} / {totalSongs}</p>
        </div>
        <div className="text-right">
          <p className="text-brand-100 text-xs uppercase tracking-wider">
            {isMyTurn ? 'Your turn!' : "Now playing"}
          </p>
          <p className="text-white font-semibold text-sm">
            {isMyTurn ? '🎵 Place the song' : `${activePlayerName}'s turn`}
          </p>
        </div>
      </div>

      {/* Scores bar */}
      <div className="flex gap-2 px-5 overflow-x-auto scrollbar-hide pb-2">
        {players.map(p => (
          <div
            key={p.id}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              p.id === activePlayerId ? 'bg-white text-brand-900' : 'bg-brand-700/50 text-brand-100'
            }`}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}: {p.score}
          </div>
        ))}
      </div>

      {/* Now playing indicator */}
      <div className="mx-5 mb-2 bg-brand-700/30 rounded-xl px-4 py-2 flex items-center gap-2">
        <div className="flex gap-0.5 items-end h-4">
          {[1,2,3,4].map(i => (
            <div
              key={i}
              className="w-1 bg-brand-300 rounded-full animate-pulse-slow"
              style={{
                height: `${[60, 100, 80, 40][i-1]}%`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <p className="text-brand-100 text-xs">
          {lastResult ? 'Song revealed' : 'Music playing on speakers'}
        </p>
      </div>

      {/* Timeline */}
      <div className="mx-5 mb-2 bg-brand-800/40 rounded-2xl overflow-hidden flex-shrink-0">
        <p className="text-brand-100 text-xs uppercase tracking-wider px-4 pt-3 pb-1">
          {isMyTurn && !lastResult ? 'Tap a slot to place the song →' : 'Your timeline'}
        </p>
        <Timeline
          cards={myTimeline}
          onPlace={handlePlace}
          isActive={isMyTurn && !lastResult}
        />
      </div>

      {/* Reveal section */}
      {lastResult && (
        <div className={`mx-5 mb-2 rounded-2xl px-4 py-3 animate-slide-up ${
          lastResult.correct ? 'bg-green-500/20 border border-green-400/30' : 'bg-red-500/20 border border-red-400/30'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{lastResult.correct ? '✅' : '❌'}</span>
            <span className="text-white font-bold text-lg">{lastResult.year}</span>
            {isMyTurn && <span className="text-white/70 text-sm">{lastResult.correct ? 'Correct!' : 'Wrong placement'}</span>}
          </div>
          <p className="text-white font-semibold">{lastResult.title}</p>
          <p className="text-white/70 text-sm">{lastResult.artist}</p>
        </div>
      )}

      {/* Artist result (Pro mode) */}
      {artistResult && (
        <div className={`mx-5 mb-2 rounded-2xl px-4 py-2 text-sm animate-slide-up ${
          artistResult.correct ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}>
          <span className="font-medium text-white">{artistResult.buzzPlayerName}</span>
          <span className="text-white/70">
            {artistResult.correct
              ? artistResult.stole ? ' stole the card! 🎯' : ' guessed the artist! 🎵'
              : ' missed the artist ✗'}
          </span>
        </div>
      )}

      {/* Controls section */}
      <div className="flex-1 flex flex-col justify-end px-5 pb-4 gap-3">
        {/* Pro mode buzz button */}
        {showBuzzButton && (
          <button
            onClick={handleBuzz}
            className="w-full py-4 bg-yellow-400 text-black rounded-xl font-bold text-lg active:scale-95 transition-transform animate-bounce-in"
          >
            🎤 I know the artist!
          </button>
        )}

        {/* Who's buzzing */}
        {buzzingPlayerId && !iAmBuzzing && (
          <div className="w-full py-3 bg-brand-700/40 rounded-xl text-center text-white text-sm">
            {buzzingPlayerName} is guessing the artist...
          </div>
        )}

        {/* Artist input */}
        {canTypeArtist && (
          <div className="flex gap-2 animate-slide-up">
            <input
              type="text"
              placeholder="Artist name..."
              value={artistGuess}
              onChange={e => setArtistGuess(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleArtistGuess()}
              className="flex-1 px-4 py-3 rounded-xl bg-brand-700 text-white placeholder-brand-100/60 outline-none focus:ring-2 focus:ring-white/30"
              autoFocus
            />
            <button
              onClick={handleArtistGuess}
              disabled={!artistGuess.trim()}
              className="px-5 py-3 bg-white text-brand-900 rounded-xl font-bold disabled:opacity-40 active:scale-95"
            >
              Guess
            </button>
          </div>
        )}

        {/* Host: next button after reveal */}
        {isHost && lastResult && !canTypeArtist && (
          <button
            onClick={() => emit(EVENTS.GAME_NEXT)}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold active:scale-95 transition-transform"
          >
            Next Song →
          </button>
        )}
      </div>
    </div>
  );
}
