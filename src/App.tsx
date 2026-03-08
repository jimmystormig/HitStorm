import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ResultsPage from './pages/ResultsPage';
import HostDisplayPage from './pages/HostDisplayPage';
import ConnectionBanner from './components/ConnectionBanner';
import { useSocket } from './hooks/useSocket';
import { useGameStore } from './store/gameStore';

function AppRoutes() {
  useSocket(); // Initialize socket connection once
  const { phase, roomCode } = useGameStore();
  const { pathname } = useLocation();
  const isHostDisplay = pathname.startsWith('/host/');

  return (
    <>
    {!isHostDisplay && <ConnectionBanner />}
    <Routes>
      {/* Host display — always accessible if you have the URL */}
      <Route path="/host/:roomCode" element={<HostDisplayPage />} />

      {/* Player routes — driven by game phase */}
      <Route path="/" element={
        phase === 'home' ? <HomePage /> :
        phase === 'lobby' ? <Navigate to={`/lobby/${roomCode}`} replace /> :
        phase === 'playing' || phase === 'placing' ? <Navigate to={`/game/${roomCode}`} replace /> :
        phase === 'finished' ? <Navigate to={`/results/${roomCode}`} replace /> :
        <HomePage />
      } />
      <Route path="/lobby/:roomCode" element={
        phase === 'lobby' ? <LobbyPage /> : <Navigate to="/" replace />
      } />
      <Route path="/game/:roomCode" element={
        phase === 'playing' || phase === 'placing' ? <GamePage /> : <Navigate to="/" replace />
      } />
      <Route path="/results/:roomCode" element={
        phase === 'finished' ? <ResultsPage /> : <Navigate to="/" replace />
      } />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
