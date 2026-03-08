import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { emit } from '../hooks/useSocket';
import { EVENTS } from '../types';
import { useGameStore } from '../store/gameStore';
import type { PlaylistMeta } from '../types';

export default function LobbyPage() {
  const { roomCode, joinUrl, hostDisplayUrl, players, hostId, playerId, isHost, selectedPlaylistId } = useGameStore();
  const [playlists, setPlaylists] = useState<PlaylistMeta[]>([]);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    fetch('/api/playlists').then(r => r.json()).then(setPlaylists).catch(() => {});
  }, []);

  const canStart = isHost && selectedPlaylistId && players.length >= 1;

  return (
    <div className="h-full flex flex-col safe-top safe-bottom overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-brand-100 text-xs uppercase tracking-wider">Room Code</p>
          <p className="font-mono text-3xl font-bold text-white tracking-widest">{roomCode}</p>
        </div>
        <button
          onClick={() => setShowQR(!showQR)}
          className="text-3xl"
          aria-label="Show QR code"
        >
          📱
        </button>
      </div>

      {/* QR Code overlay */}
      {showQR && joinUrl && (
        <div className="mx-5 mb-4 bg-white rounded-2xl p-4 flex flex-col items-center">
          <QRCodeSVG value={joinUrl} size={180} />
          <p className="text-brand-900 text-xs mt-2 font-mono">{joinUrl}</p>
          <button onClick={() => setShowQR(false)} className="mt-2 text-brand-600 text-sm font-medium">Close</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        {/* Players */}
        <div>
          <p className="text-brand-100 text-xs uppercase tracking-wider mb-2">
            Players ({players.length}/8)
          </p>
          <div className="space-y-2">
            {players.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-brand-700/50 rounded-xl px-4 py-3"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{ backgroundColor: p.color }}
                >
                  {p.name[0]?.toUpperCase()}
                </div>
                <span className="font-medium text-white">{p.name}</span>
                {p.id === hostId && (
                  <span className="ml-auto text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full">Host</span>
                )}
                {!p.connected && (
                  <span className="ml-auto text-xs text-red-400">Disconnected</span>
                )}
                {p.id === playerId && p.id !== hostId && (
                  <span className="ml-auto text-xs text-brand-100">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Playlist picker (host only) */}
        {isHost && (
          <div>
            <p className="text-brand-100 text-xs uppercase tracking-wider mb-2">Playlist</p>
            <div className="space-y-2">
              {playlists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => emit(EVENTS.LOBBY_SELECT_PLAYLIST, { playlistId: pl.id })}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                    selectedPlaylistId === pl.id
                      ? 'bg-white text-brand-900'
                      : 'bg-brand-700/50 text-white'
                  }`}
                >
                  <p className="font-semibold">{pl.name}</p>
                  <p className={`text-xs mt-0.5 ${selectedPlaylistId === pl.id ? 'text-brand-700' : 'text-brand-100'}`}>
                    {pl.description} · {pl.songCount} songs
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isHost && selectedPlaylistId && (
          <div className="bg-brand-700/50 rounded-xl px-4 py-3">
            <p className="text-brand-100 text-xs uppercase tracking-wider">Playlist</p>
            <p className="text-white font-medium">
              {playlists.find(p => p.id === selectedPlaylistId)?.name ?? selectedPlaylistId}
            </p>
          </div>
        )}

        {/* Host display link */}
        {isHost && hostDisplayUrl && (
          <div className="bg-brand-700/30 rounded-xl px-4 py-3">
            <p className="text-brand-100 text-xs uppercase tracking-wider mb-1">TV / Speaker Setup</p>
            <p className="text-white text-xs">Open this URL on your Mac, then AirPlay or Cast to your TV/speaker:</p>
            <p className="font-mono text-brand-100 text-xs mt-1 break-all">{hostDisplayUrl}</p>
          </div>
        )}
      </div>

      {/* Start button (host only) */}
      {isHost && (
        <div className="px-5 py-4">
          <button
            onClick={() => emit(EVENTS.LOBBY_START)}
            disabled={!canStart}
            className="w-full py-4 bg-white text-brand-900 rounded-xl font-bold text-lg disabled:opacity-40 active:scale-95 transition-transform"
          >
            {!selectedPlaylistId ? 'Select a playlist' : `Start Game · ${players.length} player${players.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {!isHost && (
        <div className="px-5 py-4">
          <div className="w-full py-4 bg-brand-700/30 rounded-xl text-center text-brand-100">
            Waiting for host to start...
          </div>
        </div>
      )}
    </div>
  );
}
