import { Link } from 'react-router-dom';
import { useState, useCallback } from 'react';
import {
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@shared/components/Button';
import { PricingComparisonTable } from '../components/PricingComparisonTable';
import { PricingFAQ } from '../components/PricingFAQ';
import { PricingGrid } from '../components/PricingGrid';
import { InteractivePlayground } from '../components/demo/InteractivePlayground';
import { TestimonialList } from '../components/TestimonialList';
import { ParticlePlus } from '../components/ParticlePlus';
import { OldAnkiMock } from '../components/demo/OldAnkiMock';
import { InstallSection } from '../components/InstallSection';

export function LandingPage() {
  const [introDone, setIntroDone] = useState(false);

  const handleIntroComplete = useCallback(() => {
    // Wait for the next idle period so the explosion animation frames
    // aren't interrupted by React's re-render work
    const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 16));
    schedule(() => setIntroDone(true));
  }, []);

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 40;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92]" style={{
      overflow: introDone ? undefined : 'hidden',
      height: introDone ? undefined : '100vh',
    }}>

      {/* ═══ INTRO PARTICLE ANIMATION ═══ */}
      <div
        className={`fixed inset-0 z-40 ${introDone ? 'pointer-events-none' : ''}`}
      >
        <ParticlePlus
          className="absolute inset-0"
          onIntroComplete={handleIntroComplete}
        />
      </div>

      {/* Semi-transparent overlay — dims but doesn't fully hide old Anki below */}
      <div
        className="fixed inset-0 z-30 bg-[#0F0F0F] pointer-events-none"
        style={{
          opacity: introDone ? 0 : 0.7,
          transition: 'opacity 1.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
          willChange: 'opacity',
        }}
      />

      <main className="relative z-20">

        {/* ═══ HERO ═══ */}
        <section className="relative pt-[18vh] sm:pt-[22vh] pb-20 sm:pb-28 mx-auto px-6 text-center">
          <div className="relative z-10" style={{
            opacity: introDone ? 1 : 0,
            transform: introDone ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 1s cubic-bezier(0.25,0.1,0.25,1) 0.3s, transform 1s cubic-bezier(0.25,0.1,0.25,1) 0.3s',
            willChange: 'opacity, transform',
          }}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-[-0.04em] leading-none mb-8 text-white whitespace-nowrap">
              Anki auf <span className="text-[#0a84ff]">Steroiden</span>.
            </h1>

            <p className="text-base sm:text-lg text-white/[0.35] max-w-lg mx-auto leading-relaxed mb-12 font-light">
              KI-gestütztes Lernen für Medizin, Jura und komplexe Themen.
              Verstehe Zusammenhänge, statt nur Fakten zu pauken.
            </p>

            <div className="flex gap-3 justify-center">
              <Button variant="primary" size="md" asChild>
                <Link to="/register">
                  Kostenlos starten
                  <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </Button>

              <Button variant="outline" size="md" onClick={() => handleScrollTo('demo')}>
                Ausprobieren
              </Button>
            </div>
          </div>
        </section>

        {/* ═══ DEMO SECTION — Old Anki crossfades into modern demo ═══ */}
        <section id="demo" className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-32 demo-glow relative">

          {/* Blue glow sunrise — ambient light rising from behind the demo */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: '50%',
              bottom: '-10%',
              transform: 'translateX(-50%)',
              width: '120%',
              height: '80%',
              background: 'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(10,132,255,0.18) 0%, rgba(10,132,255,0.06) 40%, transparent 70%)',
              filter: 'blur(40px)',
              opacity: introDone ? 1 : 0,
              transition: 'opacity 2s cubic-bezier(0.25, 0.1, 0.25, 1) 0.3s',
              willChange: 'opacity',
              zIndex: 0,
            }}
          />

          {/* Fixed-height container so both layers overlap during crossfade */}
          <div className="relative h-[600px] md:h-[750px] rounded-2xl" style={{ zIndex: 1 }}>

            {/* Old Anki — visible on load, crossfades out */}
            <div
              className="absolute inset-0 rounded-2xl overflow-hidden border border-white/[0.08]"
              style={{
                opacity: introDone ? 0 : 1,
                transition: 'opacity 1.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                pointerEvents: introDone ? 'none' : 'auto',
                willChange: 'opacity',
              }}
            >
              <OldAnkiMock />
            </div>

            {/* Modern Demo — crossfades in as old Anki fades out */}
            <div
              className="absolute inset-0 demo-blue-border demo-dot-grid rounded-2xl"
              style={{
                opacity: introDone ? 1 : 0,
                transition: 'opacity 1.2s cubic-bezier(0.25, 0.1, 0.25, 1) 0.1s',
                pointerEvents: introDone ? 'auto' : 'none',
                willChange: 'opacity',
              }}
            >
              <InteractivePlayground />
            </div>

          </div>
        </section>

        {/* ═══ INSTALLATION ═══ */}
        <InstallSection />

        {/* ═══ PRICING ═══ */}
        <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Einfache Preise.
            </h2>
            <p className="text-sm text-white/[0.35] font-light">
              Starte kostenlos, upgrade wenn du mehr brauchst.
            </p>
          </div>

          <PricingGrid isLoggedIn={false} />
          <PricingComparisonTable />
          <PricingFAQ />
        </section>

        {/* ═══ TESTIMONIALS ═══ */}
        <section id="testimonials" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight">
              Was Nutzer sagen.
            </h2>
          </div>

          <TestimonialList limit={15} showFallback={true} />
        </section>

        {/* ═══ BOTTOM CTA ═══ */}
        <section className="max-w-3xl mx-auto px-6 py-28 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-[-0.03em] mb-8 text-white">
            Bereit?
          </h2>

          <div className="flex flex-col items-center gap-6">
            <ul className="flex gap-6 text-white/[0.35] text-xs font-light">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#0a84ff]"/> Kostenlos starten</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-[#0a84ff]"/> Jederzeit kündbar</li>
            </ul>

            <Button variant="primary" size="md" asChild>
              <Link to="/register">Jetzt loslegen</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-white/[0.18] text-xs">
            &copy; 2025 ANKI+
          </div>
          <div className="flex gap-6 text-white/[0.18] text-xs">
            <a href="#" className="hover:text-white/[0.35] transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/[0.35] transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
