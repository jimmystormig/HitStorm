import { useEffect, useState } from 'react';
import { forceReconnect, getSocket } from '../hooks/useSocket';
import { useGameStore } from '../store/gameStore';

export default function ConnectionBanner() {
  const connected = useGameStore(s => s.connected);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (connected) {
      setCountdown(0);
      return;
    }

    const socket = getSocket();
    let timer: ReturnType<typeof setInterval> | null = null;

    const clearTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

    const startCountdown = (ms: number) => {
      clearTimer();
      let secs = Math.max(1, Math.ceil(ms / 1000));
      setCountdown(secs);
      timer = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) clearTimer();
      }, 1000);
    };

    const onReconnectAttempt = (attempt: number) => {
      const next = Math.min(500 * Math.pow(1.5, attempt), 2000);
      startCountdown(next);
    };

    startCountdown(500);
    socket.io.on('reconnect_attempt', onReconnectAttempt);

    return () => {
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      clearTimer();
    };
  }, [connected]);

  if (connected) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
        <span className="text-sm truncate">
          {countdown > 0 ? `Connection lost — retry in ${countdown}s` : 'Reconnecting…'}
        </span>
      </div>
      <button
        onClick={() => { setCountdown(0); forceReconnect(); }}
        className="bg-white text-red-600 px-3 py-1.5 rounded-lg font-bold text-xs active:scale-95 transition-transform flex-shrink-0 whitespace-nowrap"
      >
        Reconnect now
      </button>
    </div>
  );
}
