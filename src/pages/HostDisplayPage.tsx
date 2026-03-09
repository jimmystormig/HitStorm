import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { EVENTS } from '../types';
import type { PlayerInfo, PlayerScore, PlacementResult, ArtistTitleResult } from '../types';

type Phase = 'lobby' | 'playing' | 'placing' | 'finished';

interface TimelineEntry {
  year: number;
  title: string;
  artist: string;
}

interface TurnData {
  activePlayerId: string;
  activePlayerName: string;
  round: number;
  totalSongs: number;
  streamUrl: string;
  activePlayerTimeline: TimelineEntry[];
}

interface ArtistResultData {
  correct: boolean;
  artist: string;
  buzzPlayerId: string;
  buzzPlayerName: string;
  stole: boolean;
  scores?: PlayerScore[];
}

export default function HostDisplayPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUnlocked = useRef(false); // ref so event handlers always see current value
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>('lobby');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [joinUrl, setJoinUrl] = useState('');
  const [turn, setTurn] = useState<TurnData | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [artistResult, setArtistResult] = useState<ArtistResultData | null>(null);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [winner, setWinner] = useState<{ name: string; score: number } | null>(null);
  const [buzzingPlayer, setBuzzingPlayer] = useState<string | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<TimelineEntry[]>([]);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(true);
  const [artistTitleOpen, setArtistTitleOpen] = useState(false);
  const [artistTitleResult, setArtistTitleResultState] = useState<ArtistTitleResult | null>(null);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(Array(40).fill(0));

  const startAnalyser = () => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      analyserRef.current!.getByteFrequencyData(data);
      const N = 40;
      const step = Math.floor(data.length / N);
      setSpectrumBars(Array.from({ length: N }, (_, i) => data[i * step] / 255 * 100));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  };

  const stopAnalyser = () => {
    cancelAnimationFrame(animFrameRef.current);
    setSpectrumBars(Array(40).fill(0));
  };

  const playAudio = (src?: string) => {
    if (!audioRef.current) return;
    if (src) audioRef.current.src = src;
    audioRef.current.play().then(() => {
      setNeedsInteraction(false);
    }).catch(() => {
      setNeedsInteraction(true);
    });
  };

  const unlockAndPlay = () => {
    audioUnlocked.current = true;
    setNeedsInteraction(false);
    if (!audioCtxRef.current && audioRef.current) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    }
    if (audioRef.current?.src) {
      playAudio();
    }
  };

  useEffect(() => {
    const socket = io(window.location.origin, { transports: ['polling', 'websocket'] });

    socket.on(EVENTS.ROOM_UPDATED, (data) => {
      setPlayers((data.players ?? []).filter((p: PlayerInfo) => p.name !== '__host_display__'));
      if (data.phase === 'lobby') setPhase('lobby');
    });

    socket.on(EVENTS.ROOM_CREATED, (data) => {
      setJoinUrl(data.joinUrl ?? '');
    });

    socket.on(EVENTS.GAME_STARTED, () => {
      setPhase('playing');
      setScores([]);
      setResult(null);
      setArtistResult(null);
      setArtistTitleOpen(false);
      setArtistTitleResultState(null);
    });

    socket.on(EVENTS.GAME_TURN, (data: TurnData) => {
      setTurn(data);
      setActiveTimeline(data.activePlayerTimeline ?? []);
      setResult(null);
      setArtistResult(null);
      setBuzzingPlayer(null);
      setArtistTitleOpen(false);
      setArtistTitleResultState(null);
      setPhase('playing');

      if (audioRef.current) {
        audioRef.current.src = data.streamUrl;
        if (audioUnlocked.current) {
          audioRef.current.play().catch(() => setNeedsInteraction(true));
        } else {
          setNeedsInteraction(true);
        }
      }
    });

    socket.on(EVENTS.GAME_RESULT, (r: PlacementResult & { activePlayerTimeline?: TimelineEntry[] }) => {
      setResult(r);
      setPhase('placing');
      if (r.scores) setScores(r.scores);
      if (r.activePlayerTimeline) setActiveTimeline(r.activePlayerTimeline);
    });

    socket.on(EVENTS.GAME_BUZZ_OPEN, ({ buzzingPlayerName }: { buzzingPlayerName?: string }) => {
      setBuzzingPlayer(buzzingPlayerName ?? null);
    });

    socket.on(EVENTS.GAME_ARTIST_RESULT, (r: ArtistResultData) => {
      setArtistResult(r);
      if (r.scores) setScores(r.scores);
    });

    socket.on(EVENTS.GAME_ARTIST_TITLE_OPEN, () => {
      setArtistTitleOpen(true);
      setArtistTitleResultState(null);
    });

    socket.on(EVENTS.GAME_ARTIST_TITLE_RESULT, (r: ArtistTitleResult) => {
      setArtistTitleResultState(r);
      setArtistTitleOpen(false);
      if (r.scores) {
        // Convert scores Record<string,number> to PlayerScore[] by merging with current scores state
        setScores(prev => prev.map(p => {
          const newScore = r.scores[p.id];
          return newScore !== undefined ? { ...p, score: newScore } : p;
        }));
      }
    });

    socket.on(EVENTS.GAME_OVER, ({ winner: w, scores: s }: { winner: { name: string; score: number }; scores: PlayerScore[] }) => {
      setWinner(w);
      setScores(s);
      setPhase('finished');
      audioRef.current?.pause();
    });

    socket.emit(EVENTS.ROOM_JOIN, { roomCode, playerName: '__host_display__' });

    return () => {
      socket.disconnect();
      cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
    };
  }, [roomCode]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col select-none">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onPlay={() => { setAudioPlaying(true); startAnalyser(); }}
        onPause={() => { setAudioPlaying(false); stopAnalyser(); }}
        onEnded={() => { setAudioPlaying(false); stopAnalyser(); }}
        style={{ display: 'none' }}
      />

      {/* Persistent audio unlock button — shown whenever browser needs interaction */}
      {needsInteraction && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={unlockAndPlay}
            className="flex items-center gap-2 bg-white text-brand-900 font-bold px-6 py-3 rounded-full shadow-lg text-lg animate-bounce-in"
          >
            🔊 Tap to play music
          </button>
        </div>
      )}

      {/* ─── LOBBY ─── */}
      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center p-12 gap-10">
          <div className="text-center">
            <div className="text-8xl mb-4">⚡</div>
            <h1 className="text-6xl font-bold tracking-tight">HitStorm</h1>
            <p className="text-brand-100 text-xl mt-2">Music Timeline Party Game</p>
          </div>

          <div className="flex gap-16 items-start">
            {joinUrl && (
              <div className="text-center">
                <div className="bg-white p-4 rounded-2xl mb-3">
                  <QRCodeSVG value={joinUrl} size={200} />
                </div>
                <p className="text-brand-100 text-sm">Scan to join</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-brand-100 text-xl mb-2">Room Code</p>
              <p className="font-mono text-8xl font-bold tracking-widest">{roomCode}</p>
              <p className="text-brand-100 mt-4 text-lg">
                {players.length} player{players.length !== 1 ? 's' : ''} joined
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            {players.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-brand-700/50 rounded-2xl px-5 py-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
                  style={{ backgroundColor: p.color }}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <span className="font-semibold text-xl">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── PLAYING / PLACING ─── */}
      {(phase === 'playing' || phase === 'placing') && turn && (
        <div className="flex-1 flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-12 py-6">
            <div>
              <p className="text-brand-100 text-sm uppercase tracking-wider">Round</p>
              <p className="text-4xl font-bold">{turn.round} / {turn.totalSongs}</p>
            </div>
            <div className="text-4xl font-bold">⚡ HitStorm</div>
            <div className="text-right">
              <p className="text-brand-100 text-sm uppercase tracking-wider">Active Player</p>
              <p className="text-2xl font-bold">{turn.activePlayerName}</p>
            </div>
          </div>

          {/* Center */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
            {!result ? (
              <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
                <div className="flex items-end justify-center gap-[3px] h-32 w-full px-4">
                  {spectrumBars.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{
                        height: `${Math.max(h, audioPlaying ? 4 : 2)}%`,
                        background: `hsl(${270 + i * 2}, 80%, ${50 + h * 0.2}%)`,
                        opacity: audioPlaying ? 0.85 + h * 0.0015 : 0.3,
                        transition: 'height 60ms linear',
                      }}
                    />
                  ))}
                </div>
                <p className="text-2xl font-bold text-brand-100">
                  {audioPlaying ? 'Now Playing' : 'Song ready'}
                </p>
                <p className="text-lg text-brand-100/70">
                  {turn.activePlayerName} is placing the song on their timeline
                </p>
              </div>
            ) : (
              <div className="text-center animate-bounce-in">
                <div className="text-5xl mb-2">{result.correct ? '✅' : '❌'}</div>
                <p className="text-brand-100 text-xl mb-1">
                  {result.correct ? 'Correct!' : 'Wrong placement'}
                </p>
                <p className="text-7xl font-bold mb-2">{result.year}</p>

                {/* Show title/artist: hidden during artist+title guessing phase, revealed after */}
                {artistTitleResult ? (
                  <>
                    <p className="text-3xl font-bold">{artistTitleResult.title}</p>
                    <p className="text-xl text-brand-100 mt-1">{artistTitleResult.artist}</p>
                    <div className="flex gap-3 justify-center mt-3 flex-wrap">
                      {artistTitleResult.artistCorrect && (
                        <span className="bg-green-500/30 text-green-200 px-4 py-1 rounded-full font-semibold">✅ Artist!</span>
                      )}
                      {artistTitleResult.titleCorrect && (
                        <span className="bg-green-500/30 text-green-200 px-4 py-1 rounded-full font-semibold">✅ Title!</span>
                      )}
                    </div>
                  </>
                ) : artistTitleOpen ? (
                  <div className="mt-2 px-6 py-3 bg-yellow-400/20 rounded-2xl animate-pulse">
                    <p className="text-xl font-bold">
                      {turn?.activePlayerName} is guessing the artist and title... 🎤
                    </p>
                  </div>
                ) : result.title !== undefined ? (
                  <>
                    <p className="text-3xl font-bold">{result.title}</p>
                    <p className="text-xl text-brand-100 mt-1">{result.artist}</p>
                  </>
                ) : null}

                {artistResult && (
                  <div className={`mt-4 px-6 py-3 rounded-2xl animate-slide-up ${artistResult.correct ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    <p className="text-xl font-bold">
                      {artistResult.buzzPlayerName}
                      {artistResult.correct
                        ? artistResult.stole ? ' stole the card! 🎯' : ' guessed the artist! 🎵'
                        : ' missed the artist ✗'}
                    </p>
                  </div>
                )}

                {buzzingPlayer && !artistResult && (
                  <div className="mt-4 px-6 py-3 bg-yellow-400/20 rounded-2xl">
                    <p className="text-xl font-bold">{buzzingPlayer} is guessing… 🎤</p>
                  </div>
                )}
              </div>
            )}

            {/* Active player's timeline */}
            <div className="w-full">
              <p className="text-brand-100/60 text-sm uppercase tracking-wider text-center mb-2">
                {turn.activePlayerName}'s timeline
              </p>
              <div className="flex items-center justify-center gap-1 overflow-x-auto py-1">
                {activeTimeline.length === 0 ? (
                  <div className="flex items-center gap-2 text-brand-100/40 text-sm">
                    <span>Empty — first card is free!</span>
                  </div>
                ) : (
                  activeTimeline.map((card, i) => (
                    <div key={i} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`rounded-xl px-3 py-2 text-center flex-shrink-0 ${
                        result && !result.correct && i === activeTimeline.length - 1 ? 'bg-brand-700/60' : 'bg-white text-brand-900'
                      }`}>
                        <p className="font-bold text-xl leading-none">{card.year}</p>
                        <p className="text-xs mt-0.5 max-w-[80px] truncate opacity-70">{card.title}</p>
                      </div>
                      {i < activeTimeline.length - 1 && (
                        <span className="text-brand-400 text-sm">›</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Scoreboard */}
          <div className="px-12 py-6 flex gap-4 justify-center flex-wrap">
            {(scores.length > 0 ? scores : players.map(p => ({ ...p }))).map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 bg-brand-700/40 rounded-xl px-4 py-2">
                <span className="text-lg">{medals[i] ?? ''}</span>
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-medium">{p.name}</span>
                <span className="font-bold text-lg ml-1">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── FINISHED ─── */}
      {phase === 'finished' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="text-8xl">🏆</div>
          <h2 className="text-6xl font-bold">Game Over!</h2>
          {winner && (
            <p className="text-3xl text-brand-100">
              <span className="text-white font-bold">{winner.name}</span> wins with {winner.score} cards!
            </p>
          )}
          <div className="flex flex-col gap-3 w-full max-w-sm">
            {scores.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4 bg-brand-700/40 rounded-2xl px-6 py-4">
                <span className="text-3xl">{medals[i] ?? `${i + 1}.`}</span>
                <div className="w-10 h-10 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-xl font-semibold">{p.name}</span>
                <span className="text-2xl font-bold">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
