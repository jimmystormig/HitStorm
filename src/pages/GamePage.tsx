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
    artistTitleOpen, artistTitleResult,
    artistChoices, titleChoices,
  } = useGameStore();

  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [buzzTimeout, setBuzzTimeout] = useState(false);
  const [artistTitleCountdown, setArtistTitleCountdown] = useState(15);
  const [buzzCountdown, setBuzzCountdown] = useState(8);

  const isMyTurn = playerId === activePlayerId;
  const isOtherPlayersTurn = !isMyTurn;
  const showBuzzButton = gameMode === 'pro' && isOtherPlayersTurn && lastResult && !lastResult.correct && !buzzingPlayerId;
  const canTypeArtist = iAmBuzzing && !artistResult;

  // Reset state on new turn
  useEffect(() => {
    setSelectedArtist(null);
    setSelectedTitle(null);
    setBuzzTimeout(false);
  }, [round]);

  // Artist+title countdown (active player, 15 s)
  useEffect(() => {
    if (!artistTitleOpen || !isMyTurn) return;
    setArtistTitleCountdown(15);
    const id = setInterval(() => {
      setArtistTitleCountdown(n => {
        if (n <= 1) { clearInterval(id); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [artistTitleOpen, isMyTurn]);

  // Buzz steal countdown (buzzing player, 8 s)
  useEffect(() => {
    if (!canTypeArtist) return;
    setBuzzCountdown(8);
    const id = setInterval(() => {
      setBuzzCountdown(n => {
        if (n <= 1) { clearInterval(id); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [canTypeArtist]);

  const handlePlace = (position: number) => {
    emit(EVENTS.GAME_PLACE, { position });
  };

  const handleBuzz = () => {
    emit(EVENTS.GAME_BUZZ);
  };

  const handleBuzzArtistSelect = (artist: string) => {
    emit(EVENTS.GAME_GUESS_ARTIST, { artist });
  };

  const handleArtistTitleSkip = () => {
    emit(EVENTS.GAME_GUESS_ARTIST_TITLE, { artist: '', title: '' });
  };

  // Auto-submit when both artist and title are selected
  useEffect(() => {
    if (selectedArtist && selectedTitle && artistTitleOpen) {
      emit(EVENTS.GAME_GUESS_ARTIST_TITLE, { artist: selectedArtist, title: selectedTitle });
      setSelectedArtist(null);
      setSelectedTitle(null);
    }
  }, [selectedArtist, selectedTitle, artistTitleOpen]);

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

      {/* Scrollable content: timeline + reveal + controls */}
      <div className="flex-1 overflow-y-auto">

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
          {/* In Pro mode, title/artist are hidden until the guessing phase completes */}
          {artistTitleResult ? (
            <>
              <p className="text-white font-semibold">{artistTitleResult.title}</p>
              <p className="text-white/70 text-sm">{artistTitleResult.artist}</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {artistTitleResult.artistCorrect && (
                  <span className="text-xs bg-green-500/30 text-green-200 px-2 py-0.5 rounded-full">✅ Artist!</span>
                )}
                {artistTitleResult.titleCorrect && (
                  <span className="text-xs bg-green-500/30 text-green-200 px-2 py-0.5 rounded-full">✅ Title!</span>
                )}
                {!artistTitleResult.artistCorrect && !artistTitleResult.titleCorrect && isMyTurn && (
                  <span className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full">No bonus this round</span>
                )}
              </div>
            </>
          ) : artistTitleOpen ? null
          : artistResult?.songTitle ? (
            <>
              <p className="text-white font-semibold">{artistResult.songTitle}</p>
              <p className="text-white/70 text-sm">{artistResult.songArtist}</p>
            </>
          ) : lastResult.title !== undefined ? (
            <>
              <p className="text-white font-semibold">{lastResult.title}</p>
              <p className="text-white/70 text-sm">{lastResult.artist}</p>
            </>
          ) : null}
        </div>
      )}

      {/* Artist result (Pro mode buzz steal) */}
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
      <div className="flex flex-col px-5 pt-2 pb-6 gap-3">
        {/* Pro mode buzz button */}
        {showBuzzButton && (
          <button
            onClick={handleBuzz}
            className="w-full py-4 bg-yellow-400 text-black rounded-xl font-bold text-lg active:scale-95 transition-transform animate-bounce-in"
          >
            🎤 I know the artist!
          </button>
        )}

        {/* Who's buzzing (artist steal) */}
        {buzzingPlayerId && !iAmBuzzing && (
          <div className="w-full py-3 bg-brand-700/40 rounded-xl text-center text-white text-sm">
            {buzzingPlayerName} is guessing the artist...
          </div>
        )}

        {/* Artist choices (buzz steal) */}
        {canTypeArtist && artistChoices && (
          <div className="flex flex-col gap-2 animate-slide-up">
            <div className={`flex items-center justify-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full self-center ${
              buzzCountdown <= 5 ? 'bg-red-500/30 text-red-200' :
              buzzCountdown <= 8 ? 'bg-yellow-500/30 text-yellow-200' :
              'bg-white/10 text-white/70'
            }`}>
              ⏱ {buzzCountdown}s
            </div>
            <p className="text-white/70 text-sm text-center">Who is the artist?</p>
            {artistChoices.map(artist => (
              <button
                key={artist}
                onClick={() => handleBuzzArtistSelect(artist)}
                className="w-full py-3 px-4 bg-brand-700 text-white rounded-xl font-medium active:scale-95 transition-transform border border-white/10 hover:bg-brand-600"
              >
                {artist}
              </button>
            ))}
          </div>
        )}

        {/* Pro mode: active player guessing artist + title after correct placement */}
        {isMyTurn && artistTitleOpen && artistChoices && titleChoices && (
          <div className="flex flex-col gap-3 animate-slide-up">
            <div className={`flex items-center justify-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full self-center ${
              artistTitleCountdown <= 5 ? 'bg-red-500/30 text-red-200' :
              artistTitleCountdown <= 8 ? 'bg-yellow-500/30 text-yellow-200' :
              'bg-white/10 text-white/70'
            }`}>
              ⏱ {artistTitleCountdown}s
            </div>
            <div>
              <p className="text-white/70 text-sm text-center mb-2">Who is the artist?</p>
              <div className="flex flex-col gap-2">
                {artistChoices.map(artist => (
                  <button
                    key={artist}
                    onClick={() => setSelectedArtist(artist)}
                    className={`w-full py-3 px-4 rounded-xl font-medium active:scale-95 transition-all border ${
                      selectedArtist === artist
                        ? 'bg-white text-brand-900 border-white'
                        : 'bg-brand-700 text-white border-white/10 hover:bg-brand-600'
                    }`}
                  >
                    {artist}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white/70 text-sm text-center mb-2">What is the song title?</p>
              <div className="flex flex-col gap-2">
                {titleChoices.map(title => (
                  <button
                    key={title}
                    onClick={() => setSelectedTitle(title)}
                    className={`w-full py-3 px-4 rounded-xl font-medium active:scale-95 transition-all border ${
                      selectedTitle === title
                        ? 'bg-white text-brand-900 border-white'
                        : 'bg-brand-700 text-white border-white/10 hover:bg-brand-600'
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleArtistTitleSkip}
              className="w-full py-2 bg-brand-700/60 text-white/70 rounded-xl font-medium active:scale-95 transition-transform text-sm"
            >
              Skip
            </button>
          </div>
        )}

        {/* Pro mode: spectator view while active player guesses artist + title */}
        {!isMyTurn && artistTitleOpen && (
          <div className="w-full py-3 bg-brand-700/40 rounded-xl text-center text-white text-sm">
            {activePlayerName} is guessing the artist and title...
          </div>
        )}

        {/* Host: next button after reveal — hidden while artist+title guessing is open */}
        {isHost && lastResult && !canTypeArtist && !artistTitleOpen && (
          <button
            onClick={() => emit(EVENTS.GAME_NEXT)}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold active:scale-95 transition-transform"
          >
            Next Song →
          </button>
        )}
      </div>

      </div>{/* end scrollable */}
    </div>
  );
}
