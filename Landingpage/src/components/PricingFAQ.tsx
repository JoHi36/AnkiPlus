import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
  category: 'limits' | 'features' | 'billing';
}

const faqItems: FAQItem[] = [
  {
    question: 'Was passiert, wenn ich mein Tageslimit erreiche?',
    answer: 'Bei Free/Student: Du kannst weiterhin Flash Mode nutzen. Deep Mode steht erst nach dem täglichen Reset (00:00 UTC) wieder zur Verfügung. Upgrade auf Exam Pro für unbegrenzte Nutzung.',
    category: 'limits',
  },
  {
    question: 'Kann ich meinen Plan jederzeit upgraden?',
    answer: 'Ja! Upgrades werden sofort aktiv. Die Differenz wird anteilig berechnet. Downgrades werden am Ende des Abrechnungszeitraums wirksam.',
    category: 'billing',
  },
  {
    question: 'Was ist der Unterschied zwischen Flash und Deep Mode?',
    answer: 'Flash Mode: Schnelle Antworten ohne erweiterte Recherche (unbegrenzt). Deep Mode: Analysiert 10+ relevante Karten, liefert fundierte Antworten mit Quellenangaben (limitierter).',
    category: 'features',
  },
  {
    question: 'Werden meine Limits täglich zurückgesetzt?',
    answer: 'Ja, alle Limits resetten täglich um 00:00 UTC. Deine Deep Mode Credits stehen dann wieder vollständig zur Verfügung.',
    category: 'limits',
  },
  {
    question: 'Kann ich meinen Plan kündigen?',
    answer: 'Ja, jederzeit ohne Kündigungsfrist. Du behältst Zugriff bis zum Ende des bezahlten Zeitraums.',
    category: 'billing',
  },
  {
    question: 'Gibt es Studentenrabatte?',
    answer: 'Aktuell bieten wir keine zusätzlichen Studentenrabatte an. Der Student-Plan (4,99€) ist bereits für alle optimiert.',
    category: 'billing',
  },
];

const categories = {
  limits: 'Limits & Upgrades',
  features: 'Features',
  billing: 'Abrechnung',
};

export function PricingFAQ() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'limits' | 'features' | 'billing'>('all');

  const filteredItems = selectedCategory === 'all' 
    ? faqItems 
    : faqItems.filter(item => item.category === selectedCategory);

  return (
    <div className="mt-20 sm:mt-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
          Häufig gestellte Fragen
        </h3>
        <p className="text-neutral-400 text-base sm:text-lg">
          Alles, was du über ANKI+ wissen musst
        </p>
      </motion.div>

      {/* Category Filter */}
      <div className="flex flex-wrap justify-center gap-3 mb-8">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            selectedCategory === 'all'
              ? 'bg-teal-500 text-black'
              : 'bg-white/5 text-neutral-400 hover:bg-white/10'
          }`}
        >
          Alle
        </button>
        {Object.entries(categories).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key as any)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              selectedCategory === key
                ? 'bg-teal-500 text-black'
                : 'bg-white/5 text-neutral-400 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* FAQ Accordion */}
      <div className="space-y-4 max-w-3xl mx-auto">
        <AnimatePresence>
          {filteredItems.map((item, index) => {
            const isExpanded = expandedIndex === index;
            return (
              <motion.div
                key={`${item.category}-${index}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors"
              >
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="w-full p-6 flex items-start justify-between gap-4 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="font-semibold text-white flex-1">{item.question}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-neutral-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-neutral-400 flex-shrink-0 mt-0.5" />
                  )}
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6 pt-2 border-t border-white/5">
                        <p className="text-neutral-400 leading-relaxed">{item.answer}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

