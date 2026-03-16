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
  limits: 'Limits',
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
    <div className="mt-16 sm:mt-24">
      <div className="text-center mb-10">
        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 tracking-tight">
          Häufige Fragen
        </h3>
      </div>

      {/* Category Filter — pill-tab style */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-0.5 p-[3px] bg-white/[0.04] rounded-lg">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-[5px] text-xs font-medium border-none rounded-md cursor-pointer transition-colors ${
              selectedCategory === 'all'
                ? 'text-white/[0.88] font-semibold bg-white/[0.08]'
                : 'text-white/[0.35] bg-transparent hover:text-white/[0.55]'
            }`}
          >
            Alle
          </button>
          {Object.entries(categories).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key as any)}
              className={`px-4 py-[5px] text-xs font-medium border-none rounded-md cursor-pointer transition-colors ${
                selectedCategory === key
                  ? 'text-white/[0.88] font-semibold bg-white/[0.08]'
                  : 'text-white/[0.35] bg-transparent hover:text-white/[0.55]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="space-y-2 max-w-3xl mx-auto">
        {filteredItems.map((item, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <div
              key={`${item.category}-${index}`}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.10] transition-colors"
            >
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-medium text-sm text-white/[0.75] flex-1">{item.question}</span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-white/[0.22] flex-shrink-0 mt-0.5" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/[0.22] flex-shrink-0 mt-0.5" />
                )}
              </button>
              {isExpanded && (
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-1 border-t border-white/[0.04]">
                    <p className="text-sm text-white/[0.35] leading-relaxed">{item.answer}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
