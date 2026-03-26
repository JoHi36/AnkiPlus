import { useState, useEffect } from 'react';
import { Crown, GraduationCap, BadgeCheck } from 'lucide-react';
import { getApprovedTestimonials } from '../utils/testimonialService';
import { TestimonialDocument } from '../utils/testimonialTypes';

interface TestimonialListProps {
  limit?: number;
  showFallback?: boolean;
}

export function TestimonialList({ limit = 15, showFallback = true }: TestimonialListProps) {
  const [testimonials, setTestimonials] = useState<TestimonialDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTestimonials();
  }, []);

  const loadTestimonials = async () => {
    setLoading(true);
    try {
      const approved = await getApprovedTestimonials(limit);
      setTestimonials(approved);
    } catch (error) {
      console.error('Error loading testimonials:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTierInfo = (tier: string) => {
    switch (tier) {
      case 'tier2':
        return { name: 'Max', icon: Crown, color: 'text-purple-400/70', bg: 'bg-purple-500/10', border: 'border-purple-500/15' };
      case 'tier1':
        return { name: 'Pro', icon: GraduationCap, color: 'text-[#0a84ff]/70', bg: 'bg-[#0a84ff]/10', border: 'border-[#0a84ff]/15' };
      default:
        return null;
    }
  };

  const fallbackTestimonials = [
    {
      name: "Sarah M.",
      role: "Medizinstudentin, 4. Jahr",
      tier: "Max",
      useCase: "Staatsexamen",
      text: "Anki+ hat mein Physikum gerettet. Der Deep Mode ist wie ein persönlicher Professor, der 24/7 in meiner Tasche ist. Komplexe Zusammenhänge endlich verstanden.",
      verified: true
    },
    {
      name: "Jonas K.",
      role: "Jura Student, LMU",
      tier: "Pro",
      useCase: "Jura",
      text: "Endlich verstehe ich die Zusammenhänge zwischen den Paragraphen, statt nur auswendig zu lernen. Gamechanger für mein Staatsexamen.",
      verified: false
    },
    {
      name: "Dr. Lisa Weber",
      role: "Assistenzärztin",
      tier: "Max",
      useCase: "Facharzt",
      text: "Ich nutze ANKI+ zum Auffrischen von Facharztwissen. Die Deep Search Funktion spart mir täglich Stunden an Recherchezeit.",
      verified: true
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/[0.03] border border-white/[0.06] p-6 rounded-2xl animate-pulse">
            <div className="h-24 bg-white/[0.03] rounded-lg mb-4" />
            <div className="h-3 bg-white/[0.03] rounded w-3/4 mb-2" />
            <div className="h-3 bg-white/[0.03] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const displayTestimonials = testimonials.length > 0
    ? testimonials.map((t, idx) => ({
        name: `Nutzer ${idx + 1}`,
        role: t.tier === 'tier2' ? 'Max Nutzer' : 'Pro Nutzer',
        tier: t.tier === 'tier2' ? 'Max' : 'Pro',
        useCase: 'ANKI+',
        text: t.text,
        verified: t.status === 'approved',
        tierInfo: getTierInfo(t.tier)
      }))
    : showFallback
      ? fallbackTestimonials.map(t => ({
          ...t,
          tierInfo: getTierInfo(t.tier)
        }))
      : [];

  if (displayTestimonials.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayTestimonials.map((testimonial, i) => {
        const TierIcon = testimonial.tierInfo?.icon || GraduationCap;
        return (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/[0.06] p-6 rounded-2xl hover:bg-white/[0.05] hover:border-white/[0.10] transition-all duration-200"
          >
            <p className="text-white/[0.55] text-sm leading-relaxed mb-5">
              "{testimonial.text}"
            </p>

            <div className="flex flex-wrap gap-1.5 mb-5">
              {testimonial.tierInfo && (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${testimonial.tierInfo.bg} ${testimonial.tierInfo.color} border ${testimonial.tierInfo.border}`}>
                  <TierIcon size={10} className="inline mr-1" />
                  {testimonial.tier}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.04] text-white/[0.30] border border-white/[0.06]">
                {testimonial.useCase}
              </span>
              {testimonial.verified && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400/60 border border-emerald-500/15 flex items-center gap-1">
                  <BadgeCheck className="w-2.5 h-2.5" />
                  Verifiziert
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-[10px] font-semibold text-white/[0.35]">
                {testimonial.name.charAt(0)}
              </div>
              <div>
                <div className="font-medium text-xs text-white/[0.75]">{testimonial.name}</div>
                <div className="text-[11px] text-white/[0.25]">{testimonial.role}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

