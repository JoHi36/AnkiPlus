import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  CheckCircle2,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@shared/components/Button';
import { PricingComparisonTable } from '../components/PricingComparisonTable';
import { PricingFAQ } from '../components/PricingFAQ';
import { PricingGrid } from '../components/PricingGrid';
import { InteractivePlayground } from '../components/demo/InteractivePlayground';
import { TestimonialList } from '../components/TestimonialList';
import { useState, useEffect } from 'react';

export function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('features');

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-40% 0px -40% 0px' }
    );
    ['features', 'pricing', 'testimonials'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 80;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white/[0.88] overflow-x-hidden relative dot-grid">

      {/* ═══ NAVBAR ═══ */}
      <header className="fixed top-0 w-full z-50 bg-[#1A1A1A]/80 backdrop-blur-lg border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-semibold text-base tracking-tight">
            <img
              src="/anki-logo.png"
              alt="ANKI+"
              className="h-5 w-auto object-contain"
            />
          </Link>

          {/* Center: Pill Tabs (Desktop) */}
          <div className="hidden md:flex items-center gap-0.5 p-[3px] bg-white/[0.04] rounded-lg">
            {[
              { id: 'features', label: 'Features' },
              { id: 'pricing', label: 'Pricing' },
              { id: 'testimonials', label: 'Reviews' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleScrollTo(tab.id)}
                className={`px-4 py-[5px] text-xs font-medium border-none rounded-md cursor-pointer transition-colors ${
                  activeSection === tab.id
                    ? 'text-white/[0.88] font-semibold bg-white/[0.08]'
                    : 'text-white/[0.35] bg-transparent hover:text-white/[0.55]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right: Auth */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/install"
              className="text-xs font-medium text-white/[0.35] hover:text-white/[0.55] transition-colors"
            >
              Download
            </Link>
            <Link
              to="/login"
              className="text-xs font-medium text-white/[0.35] hover:text-white/[0.55] transition-colors"
            >
              Login
            </Link>
            <Button variant="primary" size="sm" asChild>
              <Link to="/register">Loslegen</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/60 hover:bg-white/[0.08] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#1A1A1A]/95 backdrop-blur-lg">
            <nav className="flex flex-col p-4 gap-1">
              {[
                { id: 'features', label: 'Features' },
                { id: 'pricing', label: 'Pricing' },
                { id: 'testimonials', label: 'Reviews' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleScrollTo(tab.id)}
                  className="px-4 py-3 rounded-lg text-sm text-white/[0.45] hover:text-white/[0.88] hover:bg-white/[0.04] transition-colors text-left"
                >
                  {tab.label}
                </button>
              ))}
              <Link
                to="/install"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg text-sm text-white/[0.45] hover:text-white/[0.88] hover:bg-white/[0.04] transition-colors"
              >
                Download
              </Link>
              <div className="border-t border-white/[0.06] my-2" />
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg text-sm text-white/[0.45] hover:text-white/[0.88] hover:bg-white/[0.04] transition-colors"
              >
                Login
              </Link>
              <Button variant="primary" size="sm" fullWidth asChild className="mt-2">
                <Link to="/register" onClick={() => setMobileMenuOpen(false)}>Loslegen</Link>
              </Button>
            </nav>
          </div>
        )}
      </header>

      <main className="relative z-10">

        {/* ═══ HERO ═══ */}
        <section className="pt-32 pb-10 max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-[1.05] mb-6 text-white">
            Anki, neu gedacht.
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-white/[0.45] max-w-2xl mx-auto leading-relaxed mb-10">
            KI-gestütztes Lernen für Medizin, Jura und komplexe Themen.{' '}
            <br className="hidden md:block"/>
            Verstehe Zusammenhänge, statt nur Fakten zu pauken.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Button variant="primary" size="md" asChild>
              <Link to="/register">
                <span className="mr-2">Kostenlos starten</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>

            <Button variant="outline" size="md" onClick={() => handleScrollTo('features')}>
              Ausprobieren
            </Button>
          </div>
        </section>

        {/* ═══ INTERACTIVE PLAYGROUND ═══ */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Probier es aus.
            </h2>
            <p className="text-base text-white/[0.35] max-w-xl mx-auto">
              Interaktive Demo — kein Account nötig.
            </p>
          </div>

          <InteractivePlayground />
        </section>

        {/* ═══ PRICING ═══ */}
        <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Einfache Preise.
            </h2>
            <p className="text-base text-white/[0.35]">
              Starte kostenlos, upgrade wenn du mehr brauchst.
            </p>
          </div>

          <PricingGrid isLoggedIn={false} />
          <PricingComparisonTable />
          <PricingFAQ />
        </section>

        {/* ═══ TESTIMONIALS ═══ */}
        <section id="testimonials" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight">
              Was Nutzer sagen.
            </h2>
          </div>

          <TestimonialList limit={15} showFallback={true} />
        </section>

        {/* ═══ BOTTOM CTA ═══ */}
        <section className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tighter mb-6 text-white">
            Bereit?
          </h2>

          <div className="flex flex-col items-center gap-6">
            <ul className="flex gap-6 text-white/[0.35] text-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0a84ff]"/> Kostenlos starten</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0a84ff]"/> Jederzeit kündbar</li>
            </ul>

            <Button variant="primary" size="lg" asChild>
              <Link to="/register">Jetzt loslegen</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/[0.06] py-8 relative z-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-white/[0.22] text-xs">
            &copy; 2025 ANKI+
          </div>
          <div className="flex gap-6 text-white/[0.22] text-xs">
            <a href="#" className="hover:text-white/[0.45] transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/[0.45] transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
