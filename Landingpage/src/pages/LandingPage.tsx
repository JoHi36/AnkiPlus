import { Link, useNavigate } from 'react-router-dom';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  Play, 
  CheckCircle2, 
  MessageSquare,
  ListChecks,
  Brain,
  Check,
  Star,
  Quote,
  Sparkles,
  Menu,
  X
} from 'lucide-react';
import { MockupEvaluation, MockupDeepReasoning } from '../components/Mockups';
import { MultipleChoiceCard, type MultipleChoiceOption } from '@shared/components/MultipleChoiceCard';
import { Button } from '@shared/components/Button';
import { useState } from 'react';

// Animation variants
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } 
  }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
};

export function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Demo data for MultipleChoiceCard
  const rescueDemoOptions: MultipleChoiceOption[] = [
    { letter: 'A', text: 'Vasokonstriktion', isCorrect: false, explanation: 'ADH hat keine direkte vasokonstriktive Wirkung.' },
    { letter: 'B', text: 'Wasserretention', isCorrect: true, explanation: 'ADH (Antidiuretisches Hormon) wirkt hauptsächlich auf die Nieren und fördert die Wasserretention durch Erhöhung der Wasserdurchlässigkeit der Sammelrohre.' },
    { letter: 'C', text: 'Natriumausscheidung', isCorrect: false, explanation: 'ADH beeinflusst primär die Wasserretention, nicht die Natriumausscheidung.' },
    { letter: 'D', text: 'Kaliumretention', isCorrect: false, explanation: 'ADH hat keinen direkten Einfluss auf die Kaliumretention.' },
  ];

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-teal-500/30 overflow-x-hidden relative">
      
      {/* --- LAYER 2: Masked Grid Pattern --- */}
      <div className="fixed inset-0 z-0 pointer-events-none h-screen">
        <div 
          className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px]"
          style={{
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)'
          }}
        />
      </div>

      {/* --- LAYER 3: High-End Atmosphere --- */}
      <div className="fixed top-[-20%] left-1/2 -translate-x-1/2 w-[100vw] h-[800px] bg-teal-500/15 rounded-full blur-[120px] pointer-events-none z-0 mix-blend-screen opacity-60" />
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Navbar */}
      <header className="absolute top-0 w-full z-50 p-4 sm:p-6 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 font-bold text-lg sm:text-xl tracking-tight cursor-pointer group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 shadow-[0_0_20px_rgba(20,184,166,0.2)] group-hover:shadow-[0_0_30px_rgba(20,184,166,0.4)] transition-all">
              <span className="text-teal-400 group-hover:text-teal-300 transition-colors text-sm sm:text-base">A+</span>
            </div>
            <span className="text-white drop-shadow-[0_0_15px_rgba(20,184,166,0.3)] group-hover:text-teal-50 transition-colors">ANKI+</span>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <nav className="flex gap-8 text-sm text-neutral-400 font-medium">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <Link to="/install" className="hover:text-white transition-colors">Download</Link>
            </nav>
            <div className="flex items-center gap-4">
              <Link 
                to="/login"
                className="text-sm font-medium text-neutral-400 hover:text-white transition-colors min-h-[44px] flex items-center"
              >
                Login
              </Link>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/register">Get Started</Link>
              </Button>
            </div>
          </div>
          
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors min-h-[44px]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden mt-4 bg-[#0A0A0A] border-t border-white/10 rounded-2xl overflow-hidden"
            >
              <nav className="flex flex-col p-4 gap-2">
                <a 
                  href="#features" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors min-h-[44px] flex items-center"
                >
                  Features
                </a>
                <a 
                  href="#pricing" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors min-h-[44px] flex items-center"
                >
                  Pricing
                </a>
                <Link 
                  to="/install" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors min-h-[44px] flex items-center"
                >
                  Download
                </Link>
                <div className="border-t border-white/10 my-2" />
                <Link 
                  to="/login" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors min-h-[44px] flex items-center"
                >
                  Login
                </Link>
                <Button variant="primary" size="md" fullWidth asChild className="mt-2">
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
                </Button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="relative z-10 pt-32 sm:pt-40 md:pt-44 pb-20">
        
        {/* --- Hero Section --- */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col items-center text-center relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-32 bg-teal-500/20 blur-[80px] -z-10 rounded-full" />

          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center max-w-5xl"
          >
            <motion.div variants={fadeInUp} className="mb-10">
              <span className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full text-sm font-medium bg-teal-950/40 border border-teal-500/50 text-teal-300 shadow-[0_0_30px_-10px_rgba(45,212,191,0.4)] backdrop-blur-md ring-1 ring-white/10 hover:bg-teal-950/60 transition-colors cursor-default">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500 shadow-[0_0_8px_2px_rgba(20,184,166,0.6)]"></span>
                </span>
                Jetzt verfügbar: ANKI+ Deep Mode
              </span>
            </motion.div>

            <motion.h1 
              variants={fadeInUp}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-extrabold tracking-tighter leading-[1] mb-6 sm:mb-10 text-white drop-shadow-2xl"
            >
              Anki auf <br className="md:hidden" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-400 to-teal-600 drop-shadow-[0_0_30px_rgba(45,212,191,0.3)]">
                Steroiden
              </span>.
            </motion.h1>

            <motion.p 
              variants={fadeInUp}
              className="text-base sm:text-lg md:text-xl lg:text-2xl text-neutral-300 max-w-3xl leading-relaxed mb-8 sm:mb-14 font-light px-4"
            >
              Das KI-Gehirn für deine Karteikarten. <br className="hidden md:block"/>
              Verstehe Medizin, Jura und komplexe Themen, statt nur Fakten zu pauken.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 sm:gap-5 w-full max-w-2xl px-4 sm:px-0 justify-center">
              <Button variant="primary" size="lg" fullWidth className="sm:w-auto" asChild>
                <Link to="/register">
                  <span className="mr-2">Kostenlos starten</span>
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </Button>
              
              <Button variant="outline" size="lg" fullWidth className="sm:w-auto">
                <Play className="mr-2 w-4 h-4 fill-white" />
                Wie es funktioniert
              </Button>
            </motion.div>
          </motion.div>
        </section>

        {/* --- 3-STEP FEATURE JOURNEY --- */}
        <section id="features" className="mt-20 sm:mt-32 md:mt-40 max-w-7xl mx-auto px-4 sm:px-6 flex flex-col gap-16 sm:gap-24 md:gap-32 lg:gap-40">
          
          {/* STEP 1: EVALUATION */}
          <div className="flex flex-col lg:flex-row items-center gap-12 sm:gap-16 lg:gap-24">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1"
            >
              <div className="aspect-[4/3] lg:aspect-auto lg:h-[450px]">
                <MockupEvaluation />
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1 space-y-6 sm:space-y-8"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center border border-yellow-500/20">
                <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 sm:mb-6">Dein persönlicher Prüfer.</h2>
                <p className="text-base sm:text-lg md:text-xl text-neutral-400 leading-relaxed">
                  Schluss mit binärem Richtig/Falsch. Tipp deine Antwort ein – ANKI+ versteht Nuancen, lobt Details und korrigiert Konzepte wie ein echter Tutor.
                </p>
              </div>
            </motion.div>
          </div>

          {/* STEP 2: RESCUE - Using Real MultipleChoiceCard */}
          <div className="flex flex-col lg:flex-row-reverse items-center gap-12 sm:gap-16 lg:gap-24">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1"
            >
              <div className="bg-[#0A0A0A] rounded-2xl border border-white/10 p-4 sm:p-6">
                <MultipleChoiceCard
                  question="Was ist die Hauptwirkung von ADH?"
                  options={rescueDemoOptions}
                  onSelect={(option) => {
                    // Demo interaction - could add analytics here
                    console.log('Selected:', option);
                  }}
                />
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1 space-y-6 sm:space-y-8"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center border border-teal-500/20">
                <ListChecks className="w-6 h-6 sm:w-7 sm:h-7 text-teal-400" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 sm:mb-6">Nie wieder Frust-Moment.</h2>
                <p className="text-base sm:text-lg md:text-xl text-neutral-400 leading-relaxed">
                  Keine Ahnung? Wandel die Karte sofort in ein Quiz um. Der sanfteste Weg, um Blockaden zu lösen und im Flow zu bleiben.
                </p>
              </div>
            </motion.div>
          </div>

          {/* STEP 3: DEEP REASONING */}
          <div className="flex flex-col lg:flex-row items-center gap-12 sm:gap-16 lg:gap-24">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1"
            >
              <div className="aspect-[4/3] lg:aspect-auto lg:h-[550px]">
                <MockupDeepReasoning />
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1 space-y-6 sm:space-y-8"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 sm:mb-6">
                  Die Erleuchtung <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-300">
                    (Deep Mode).
                  </span>
                </h2>
                <p className="text-base sm:text-lg md:text-xl text-neutral-400 leading-relaxed">
                  Das ist mehr als eine Antwort. ANKI+ analysiert 10+ Quellen, vernetzt das Wissen und liefert dir eine Synthese auf Facharzt-Niveau.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* --- Pricing Section --- */}
        <section id="pricing" className="mt-20 sm:mt-32 md:mt-40 max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl bg-teal-900/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 tracking-tight">Investiere in dein Gehirn.</h2>
            <p className="text-base sm:text-lg md:text-xl text-neutral-400">Wähle den unfairen Vorteil, der zu dir passt.</p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-start"
          >
            
            {/* Starter (Free) */}
            <motion.div variants={fadeInUp} className="relative rounded-3xl border border-white/10 bg-neutral-900/40 p-6 sm:p-8 md:p-10 backdrop-blur-sm hover:border-white/20 transition-colors">
              <div className="mb-6 inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-neutral-400">
                Starter
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">0€</span>
                <span className="text-neutral-500 text-lg">/Monat</span>
              </div>
              <p className="text-neutral-400 text-sm mb-8 h-10 leading-relaxed">
                Perfekt, um die Magie von ANKI+ kennenzulernen.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-neutral-300">
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-neutral-500" /> Unbegrenzt Flash Mode</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-white" /> 3x Deep Mode pro Tag</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-neutral-500" /> Basis-Support</li>
              </ul>
              <Link 
                to="/register"
                className="block w-full py-4 rounded-full border border-white/10 font-medium text-white hover:bg-white hover:text-black transition-all text-center"
              >
                Download
              </Link>
            </motion.div>

            {/* Student (Most Popular) */}
            <motion.div variants={fadeInUp} className="relative rounded-3xl border border-teal-500/50 bg-[#0F1110] p-6 sm:p-8 md:p-10 shadow-[0_0_50px_-15px_rgba(20,184,166,0.2)] md:scale-105 z-10 flex flex-col">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-teal-500 text-black text-xs font-bold rounded-full uppercase tracking-wider shadow-lg shadow-teal-500/20">
                Beliebt
              </div>
              <div className="mb-6 inline-block px-3 py-1 rounded-full bg-teal-950/50 border border-teal-500/30 text-xs font-medium text-teal-400">
                Student
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">4,99€</span>
                <span className="text-neutral-500 text-lg">/Monat</span>
              </div>
              <p className="text-neutral-400 text-sm mb-8 h-10 leading-relaxed">
                Für alle, die Prüfungen nicht nur bestehen, sondern rocken wollen.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-neutral-200">
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Alles aus Starter</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> 50x Deep Mode pro Tag</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Priorisierte Generierung</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Werbefrei</li>
              </ul>
              <Link 
                to="/register"
                className="w-full py-4 rounded-full bg-teal-500 font-bold text-black text-lg hover:bg-teal-400 hover:shadow-[0_0_30px_rgba(20,184,166,0.4)] transition-all transform hover:-translate-y-1 text-center block"
              >
                Jetzt starten
              </Link>
            </motion.div>

            {/* Exam Pro (Ultimate) */}
            <motion.div variants={fadeInUp} className="relative rounded-3xl border border-white/10 bg-neutral-900/40 p-6 sm:p-8 md:p-10 backdrop-blur-sm hover:border-purple-500/30 transition-colors">
              <div className="mb-6 inline-block px-3 py-1 rounded-full bg-purple-900/20 border border-purple-500/30 text-xs font-medium text-purple-300">
                Fürs Examen
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">14,99€</span>
                <span className="text-neutral-500 text-lg">/Monat</span>
              </div>
              <p className="text-neutral-400 text-sm mb-8 h-10 leading-relaxed">
                Das ultimative Werkzeug für Staatsexamen und High-Stakes Tests.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-neutral-300">
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> Alles aus Student</li>
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span className="text-white font-medium">UNBEGRENZT</span> Deep Mode</li>
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> Deep Search (25 Quellen)</li>
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> 24/7 Priority Support</li>
              </ul>
              <Link 
                to="/register"
                className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 font-medium text-white hover:opacity-90 transition-opacity shadow-lg shadow-purple-900/20 text-center block"
              >
                Pro werden
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* --- Testimonials Section --- */}
        <section className="mt-20 sm:mt-32 md:mt-40 max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Von High-Performern geliebt</h2>
            <div className="flex justify-center gap-1 text-teal-400 mb-2">
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
            </div>
            <p className="text-neutral-400 text-sm">4.9/5 Durchschnittsbewertung</p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[
              {
                name: "Sarah M.",
                role: "Medizinstudentin, 4. Jahr",
                text: "Anki+ hat mein Physikum gerettet. Der Deep Mode ist wie ein persönlicher Professor, der 24/7 in meiner Tasche ist. Komplexe Zusammenhänge endlich verstanden.",
                image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces"
              },
              {
                name: "Jonas K.",
                role: "Jura Student, LMU",
                text: "Endlich verstehe ich die Zusammenhänge zwischen den Paragraphen, statt nur auswendig zu lernen. Gamechanger für mein Staatsexamen.",
                image: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop&crop=faces"
              },
              {
                name: "Dr. Lisa Weber",
                role: "Assistenzärztin",
                text: "Ich nutze ANKI+ zum Auffrischen von Facharztwissen. Die Deep Search Funktion spart mir täglich Stunden an Recherchezeit.",
                image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=faces"
              }
            ].map((testimonial, i) => (
              <motion.div key={i} variants={fadeInUp} className="glass-card p-6 sm:p-8 md:p-10 rounded-3xl relative bg-neutral-900/30 hover:bg-neutral-900/50 transition-colors">
                <Quote className="w-10 h-10 text-teal-500/10 absolute top-8 right-8" />
                <p className="text-neutral-300 leading-relaxed mb-8 relative z-10 text-lg font-light">
                  "{testimonial.text}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10">
                    <img src={testimonial.image} alt={testimonial.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-base">{testimonial.name}</div>
                    <div className="text-teal-500/80 text-sm">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* --- CTA Section --- */}
        <section className="mt-20 sm:mt-32 md:mt-40 mb-20 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-teal-500/15 blur-[120px] rounded-full -z-10" />
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold tracking-tighter mb-6 sm:mb-8 text-white">
              Bereit für den <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-teal-200 to-teal-500">unfairen Vorteil?</span>
            </h2>
            
            <div className="flex flex-col items-center gap-8">
              <ul className="flex gap-8 text-neutral-400 text-sm mb-4">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-teal-500"/> 14 Tage kostenlos</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-teal-500"/> Jederzeit kündbar</li>
              </ul>
              
              <Button variant="primary" size="lg" asChild>
                <Link to="/register">Jetzt kostenlos starten</Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 sm:py-12 bg-[#030303] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
          <div className="text-neutral-500 text-sm">
            &copy; 2024 ANKI+. Built for high performers.
          </div>
          <div className="flex gap-8 text-neutral-500 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

