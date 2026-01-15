import { motion } from 'framer-motion';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface Feature {
  name: string;
  description?: string;
  free: string | boolean;
  tier1: string | boolean;
  tier2: string | boolean;
  highlight?: boolean;
}

const features: Feature[] = [
  {
    name: 'Flash Mode',
    description: 'Schnelle KI-Antworten ohne Deep Search',
    free: 'Unbegrenzt',
    tier1: 'Unbegrenzt',
    tier2: 'Unbegrenzt',
  },
  {
    name: 'Deep Mode',
    description: 'Erweiterte Analyse mit 10+ Quellen',
    free: '3x pro Tag',
    tier1: '30x pro Tag',
    tier2: '500x pro Tag',
    highlight: true,
  },
  {
    name: 'Deep Search',
    description: 'Anzahl der durchsuchten Quellen',
    free: '8 Karten',
    tier1: '8 Karten',
    tier2: '25 Karten',
  },
  {
    name: 'Priorisierte Generierung',
    description: 'Schnellere Antwortzeiten',
    free: false,
    tier1: true,
    tier2: true,
  },
  {
    name: 'Werbefrei',
    free: false,
    tier1: true,
    tier2: true,
  },
  {
    name: '24/7 Priority Support',
    free: false,
    tier1: false,
    tier2: true,
  },
  {
    name: 'Analytics Dashboard',
    description: 'Detaillierte Nutzungsstatistiken',
    free: false,
    tier1: true,
    tier2: true,
  },
];

function formatValue(value: string | boolean): React.ReactNode {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="w-5 h-5 text-teal-400 mx-auto" />
    ) : (
      <X className="w-5 h-5 text-neutral-500 mx-auto" />
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
}

export function PricingComparisonTable() {
  const [expandedMobile, setExpandedMobile] = useState<number | null>(null);

  return (
    <div className="mt-20 sm:mt-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
          Alle Features im Vergleich
        </h3>
        <p className="text-neutral-400 text-base sm:text-lg">
          Finde den Plan, der perfekt zu dir passt
        </p>
      </motion.div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden"
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="sticky top-0 z-10 text-left p-6 font-semibold text-white bg-[#0A0A0A] backdrop-blur-sm">Feature</th>
                <th className="sticky top-0 z-10 text-center p-6 font-semibold text-neutral-400 bg-[#0A0A0A] backdrop-blur-sm">Starter</th>
                <th className="sticky top-0 z-10 text-center p-6 font-semibold text-teal-400 bg-[#0A0A0A] backdrop-blur-sm">Student</th>
                <th className="sticky top-0 z-10 text-center p-6 font-semibold text-purple-400 bg-[#0A0A0A] backdrop-blur-sm">Exam Pro</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <motion.tr
                  key={feature.name}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    feature.highlight ? 'bg-teal-500/5' : ''
                  }`}
                >
                  <td className="p-6">
                    <div className="flex flex-col">
                      <span className="font-medium text-white mb-1">{feature.name}</span>
                      {feature.description && (
                        <span className="text-xs text-neutral-500">{feature.description}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-6 text-center">{formatValue(feature.free)}</td>
                  <td className="p-6 text-center bg-teal-500/5">{formatValue(feature.tier1)}</td>
                  <td className="p-6 text-center bg-purple-500/5">{formatValue(feature.tier2)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>

      {/* Mobile Accordion */}
      <div className="lg:hidden space-y-4">
        {features.map((feature, index) => (
          <motion.div
            key={feature.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className={`bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden ${
              feature.highlight ? 'ring-1 ring-teal-500/30' : ''
            }`}
          >
            <button
              onClick={() => setExpandedMobile(expandedMobile === index ? null : index)}
              className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 text-left">
                <div className="font-medium text-white mb-1">{feature.name}</div>
                {feature.description && (
                  <div className="text-xs text-neutral-500">{feature.description}</div>
                )}
              </div>
              {expandedMobile === index ? (
                <ChevronUp className="w-5 h-5 text-neutral-400 flex-shrink-0 ml-4" />
              ) : (
                <ChevronDown className="w-5 h-5 text-neutral-400 flex-shrink-0 ml-4" />
              )}
            </button>
            {expandedMobile === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-white/10"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-400">Starter</span>
                    <div className="flex-1 mx-4 h-px bg-white/5" />
                    <div className="text-sm">{formatValue(feature.free)}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-teal-400">Student</span>
                    <div className="flex-1 mx-4 h-px bg-white/5" />
                    <div className="text-sm">{formatValue(feature.tier1)}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-purple-400">Exam Pro</span>
                    <div className="flex-1 mx-4 h-px bg-white/5" />
                    <div className="text-sm">{formatValue(feature.tier2)}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}


