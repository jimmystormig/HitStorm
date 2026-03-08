import { useState, useEffect } from 'react';
import { emit } from '../hooks/useSocket';
import { EVENTS } from '../types';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../hooks/useSocket';

export default function HomePage() {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gameMode, setGameMode] = useState<'classic' | 'pro'>('classic');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  // Pre-fill join code from URL param (?join=XXXX)
  const params = new URLSearchParams(window.location.search);
  const joinParam = params.get('join');
  const autoname = params.get('autoname');

  useEffect(() => {
    const socket = getSocket();

    const tryAutoJoin = () => {
      if (autoname && joinParam) {
        useGameStore.setState({ playerName: autoname, isHost: false });
        emit(EVENTS.ROOM_JOIN, { playerName: autoname, roomCode: joinParam.toUpperCase() });
        setLoading(true);
      }
    };

    setConnected(socket.connected);
    if (socket.connected) tryAutoJoin();

    const connectHandler = () => { setConnected(true); tryAutoJoin(); };
    const disconnectHandler = () => setConnected(false);
    const roomErrorHandler = ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
    };

    socket.on('connect', connectHandler);
    socket.on('disconnect', disconnectHandler);
    socket.on(EVENTS.ROOM_ERROR, roomErrorHandler);

    return () => {
      socket.off('connect', connectHandler);
      socket.off('disconnect', disconnectHandler);
      socket.off(EVENTS.ROOM_ERROR, roomErrorHandler);
    };
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;
    setError('');
    setLoading(true);
    useGameStore.setState({ playerName: name, isHost: true });
    emit(EVENTS.ROOM_CREATE, { playerName: name, gameMode });
  };

  const handleJoin = () => {
    const roomCode = (joinParam ?? code).toUpperCase();
    if (!name.trim() || !roomCode.trim()) return;
    setError('');
    setLoading(true);
    useGameStore.setState({ playerName: name, isHost: false });
    emit(EVENTS.ROOM_JOIN, { playerName: name, roomCode });
  };

  const isJoining = mode === 'join' || !!joinParam;

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 safe-top safe-bottom">
      {/* Connection status */}
      <div className={`absolute top-4 right-4 flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
        {connected ? 'Connected' : 'Connecting…'}
      </div>

      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="text-6xl mb-2">⚡</div>
        <h1 className="text-4xl font-bold text-white tracking-tight">HitStorm</h1>
        <p className="text-brand-100 mt-1 text-sm">Guess the year, own the timeline</p>
      </div>

      {/* Tabs */}
      {!joinParam && (
        <div className="flex bg-brand-700 rounded-xl p-1 mb-6 w-full max-w-xs">
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!isJoining ? 'bg-white text-brand-900' : 'text-brand-100'}`}
            onClick={() => setMode('create')}
          >
            Create Game
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${isJoining ? 'bg-white text-brand-900' : 'text-brand-100'}`}
            onClick={() => setMode('join')}
          >
            Join Game
          </button>
        </div>
      )}

      <div className="w-full max-w-xs space-y-4">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          maxLength={20}
          className="w-full px-4 py-3 rounded-xl bg-brand-700 text-white placeholder-brand-100/60 text-lg outline-none focus:ring-2 focus:ring-white/30"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        {isJoining && !joinParam && (
          <input
            type="text"
            placeholder="Room code (e.g. ABCD)"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
            maxLength={4}
            className="w-full px-4 py-3 rounded-xl bg-brand-700 text-white placeholder-brand-100/60 text-lg text-center tracking-widest font-mono uppercase outline-none focus:ring-2 focus:ring-white/30"
            autoComplete="off"
            autoCorrect="off"
          />
        )}

        {joinParam && (
          <div className="text-center py-3 bg-brand-700 rounded-xl">
            <span className="text-brand-100 text-sm">Joining room </span>
            <span className="font-mono font-bold text-white">{joinParam}</span>
          </div>
        )}

        {!isJoining && (
          <div className="flex bg-brand-700 rounded-xl p-1">
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${gameMode === 'classic' ? 'bg-white text-brand-900' : 'text-brand-100'}`}
              onClick={() => setGameMode('classic')}
            >
              Classic
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${gameMode === 'pro' ? 'bg-white text-brand-900' : 'text-brand-100'}`}
              onClick={() => setGameMode('pro')}
            >
              Pro (+ Artist)
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-500/20 border border-red-400/30 text-red-300 text-sm px-4 py-3 rounded-xl text-center">
            {error}
          </div>
        )}

        <button
          onClick={isJoining ? handleJoin : handleCreate}
          disabled={!name.trim() || loading || !connected}
          className="w-full py-4 bg-white text-brand-900 rounded-xl font-bold text-lg disabled:opacity-40 active:scale-95 transition-transform"
        >
          {loading ? 'Joining…' : isJoining ? 'Join Game' : 'Create Game'}
        </button>

        {!connected && (
          <p className="text-center text-brand-100/60 text-xs">Waiting for server connection…</p>
        )}
      </div>
    </div>
  );
}
