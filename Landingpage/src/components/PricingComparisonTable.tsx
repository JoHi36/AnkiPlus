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
  { name: 'Tägliches Token-Budget', description: 'Tokens pro Tag für alle KI-Funktionen', free: '20K', tier1: '70K', tier2: '210K', highlight: true },
  { name: 'Wöchentliches Token-Budget', description: 'Flexibles Wochenlimit', free: '100K', tier1: '350K', tier2: '1.05M' },
  { name: 'Deep Search', description: 'Anzahl der durchsuchten Quellen', free: '8 Karten', tier1: '8 Karten', tier2: '25 Karten' },
  { name: 'Priorisierte Generierung', description: 'Schnellere Antwortzeiten', free: false, tier1: true, tier2: true },
  { name: 'Werbefrei', free: false, tier1: true, tier2: true },
  { name: '24/7 Priority Support', free: false, tier1: false, tier2: true },
  { name: 'Analytics Dashboard', description: 'Detaillierte Nutzungsstatistiken', free: false, tier1: true, tier2: true },
];

function formatValue(value: string | boolean): React.ReactNode {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="w-4 h-4 text-[#0a84ff]/70 mx-auto" />
    ) : (
      <X className="w-4 h-4 text-white/[0.15] mx-auto" />
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
}

export function PricingComparisonTable() {
  const [expandedMobile, setExpandedMobile] = useState<number | null>(null);

  return (
    <div className="mt-16 sm:mt-24">
      <div className="text-center mb-10">
        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 tracking-tight">
          Alle Features im Vergleich
        </h3>
        <p className="text-white/[0.35] text-sm sm:text-base">
          Finde den Plan, der zu dir passt.
        </p>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left p-5 font-semibold text-sm text-white/[0.92]">Feature</th>
                <th className="text-center p-5 font-medium text-sm text-white/[0.35]">Starter</th>
                <th className="text-center p-5 font-medium text-sm text-[#0a84ff]/70">Student</th>
                <th className="text-center p-5 font-medium text-sm text-purple-400/70">Exam Pro</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr
                  key={feature.name}
                  className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                    feature.highlight ? 'bg-[#0a84ff]/[0.02]' : ''
                  }`}
                >
                  <td className="p-5">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-white/[0.75] mb-0.5">{feature.name}</span>
                      {feature.description && (
                        <span className="text-xs text-white/[0.18]">{feature.description}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-5 text-center">{formatValue(feature.free)}</td>
                  <td className="p-5 text-center bg-[#0a84ff]/[0.02]">{formatValue(feature.tier1)}</td>
                  <td className="p-5 text-center bg-purple-500/[0.02]">{formatValue(feature.tier2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Accordion */}
      <div className="lg:hidden space-y-2">
        {features.map((feature, index) => (
          <div
            key={feature.name}
            className={`bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden ${
              feature.highlight ? 'border-[#0a84ff]/15' : ''
            }`}
          >
            <button
              onClick={() => setExpandedMobile(expandedMobile === index ? null : index)}
              className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex-1 text-left">
                <div className="font-medium text-sm text-white/[0.75] mb-0.5">{feature.name}</div>
                {feature.description && (
                  <div className="text-xs text-white/[0.18]">{feature.description}</div>
                )}
              </div>
              {expandedMobile === index ? (
                <ChevronUp className="w-4 h-4 text-white/[0.18] flex-shrink-0 ml-4" />
              ) : (
                <ChevronDown className="w-4 h-4 text-white/[0.18] flex-shrink-0 ml-4" />
              )}
            </button>
            {expandedMobile === index && (
              <div className="border-t border-white/[0.06]">
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/[0.35]">Starter</span>
                    <div className="flex-1 mx-4 h-px bg-white/[0.04]" />
                    <div className="text-sm">{formatValue(feature.free)}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#0a84ff]/60">Student</span>
                    <div className="flex-1 mx-4 h-px bg-white/[0.04]" />
                    <div className="text-sm">{formatValue(feature.tier1)}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-400/60">Exam Pro</span>
                    <div className="flex-1 mx-4 h-px bg-white/[0.04]" />
                    <div className="text-sm">{formatValue(feature.tier2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
