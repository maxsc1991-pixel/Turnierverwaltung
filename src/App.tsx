import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Logo } from './components/Logo';
import { ConfigPage } from './pages/ConfigPage';
import { PlanPage } from './pages/PlanPage';
import { KoSetupPage } from './pages/KoSetupPage';
import { LivePage } from './pages/LivePage';
import { DisplayPage } from './pages/DisplayPage';
import { HistoryPage } from './pages/HistoryPage';
import { useTournamentStore } from './store/useTournamentStore';

function Header() {
  const active = useTournamentStore((s) => s.active);
  const planReady = Boolean(active);
  const liveReady = Boolean(active && active.stage !== 'plan');

  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : '');

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <NavLink to="/" className="brand">
          <Logo size={44} className="brand__logo" />
          <span className="brand__text">
            <span className="brand__title">Turnierverwaltung</span>
            <span className="brand__subtitle">DC Lok Pfalzel · Dart &amp; Cornhole</span>
          </span>
        </NavLink>

        <nav className="app-nav">
          <NavLink to="/" end className={linkClass}>
            Konfiguration
          </NavLink>
          <NavLink to="/plan" className={linkClass} aria-disabled={!planReady}>
            Turnierplan
          </NavLink>
          <NavLink to="/live" className={linkClass} aria-disabled={!liveReady}>
            Turnier
          </NavLink>
          <NavLink to="/anzeige" className={linkClass} aria-disabled={!liveReady}>
            Anzeige
          </NavLink>
          <NavLink to="/historie" className={linkClass}>
            Ewige Tabelle
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Header />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<ConfigPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/ko-start" element={<KoSetupPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/anzeige" element={<DisplayPage />} />
            <Route path="/historie" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
