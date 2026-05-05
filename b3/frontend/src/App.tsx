import { Link, NavLink, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Programs from "./pages/Programs";
import Submit from "./pages/Submit";
import AttestationView from "./pages/Attestation";
import VerifyPage from "./pages/Verify";

export default function App() {
  return (
    <div className="min-h-full">
      <header className="border-b border-b3-fog bg-b3-ink/95 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-b3-mint glow-mint text-2xl font-bold tracking-tight">
            B³
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <NavLink to="/programs" className={navClass}>Programs</NavLink>
            <NavLink to="/submit"   className={navClass}>Submit</NavLink>
            <NavLink to="/verify"   className={navClass}>Verify</NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Routes>
          <Route path="/"               element={<Landing />} />
          <Route path="/programs"       element={<Programs />} />
          <Route path="/submit"         element={<Submit />} />
          <Route path="/verify"         element={<VerifyPage />} />
          <Route path="/verify/:id"     element={<VerifyPage />} />
          <Route path="/attestation/:id" element={<AttestationView />} />
        </Routes>
      </main>

      <footer className="border-t border-b3-fog mt-16 py-6 text-center text-xs text-b3-bone/50">
        B³ — sovereign bug bounty broker on EigenCloud · Demo Day, May 12, 2026
      </footer>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `transition ${isActive ? "text-b3-mint glow-mint" : "text-b3-bone/70 hover:text-b3-bone"}`;
}
