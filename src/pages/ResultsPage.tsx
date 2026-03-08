import { emit } from '../hooks/useSocket';
import { EVENTS } from '../types';
import { useGameStore } from '../store/gameStore';

export default function ResultsPage() {
  const { winner, finalScores, isHost, players } = useGameStore();

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 safe-top safe-bottom">
      <div className="text-center mb-8 animate-bounce-in">
        <div className="text-6xl mb-3">🏆</div>
        <h2 className="text-3xl font-bold text-white">Game Over!</h2>
        {winner && (
          <p className="text-brand-100 mt-2">
            <span className="text-white font-semibold">{winner.name}</span> wins with {winner.score} cards!
          </p>
        )}
      </div>

      <div className="w-full max-w-xs space-y-3 mb-8">
        {finalScores.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-3 bg-brand-700/50 rounded-xl px-4 py-3 animate-slide-up"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span className="text-2xl w-8 text-center">{medals[i] ?? `${i + 1}.`}</span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: p.color }}>
              {p.name[0]?.toUpperCase()}
            </div>
            <span className="flex-1 font-medium text-white">{p.name}</span>
            <span className="text-white font-bold text-lg">{p.score}</span>
          </div>
        ))}
      </div>

      {isHost && (
        <button
          onClick={() => emit(EVENTS.GAME_PLAY_AGAIN)}
          className="w-full max-w-xs py-4 bg-white text-brand-900 rounded-xl font-bold text-lg active:scale-95 transition-transform"
        >
          Play Again
        </button>
      )}

      {!isHost && (
        <p className="text-brand-100 text-sm">Waiting for host to start a new game...</p>
      )}
    </div>
  );
}
