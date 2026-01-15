import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Quote, BadgeCheck, Crown, GraduationCap } from 'lucide-react';
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
        return { 
          name: 'Exam Pro', 
          icon: Crown, 
          color: 'text-purple-300',
          bg: 'bg-purple-500/20',
          border: 'border-purple-500/30'
        };
      case 'tier1':
        return { 
          name: 'Student', 
          icon: GraduationCap, 
          color: 'text-teal-300',
          bg: 'bg-teal-500/20',
          border: 'border-teal-500/30'
        };
      default:
        return null;
    }
  };

  // Fallback to static testimonials if none available
  const fallbackTestimonials = [
    {
      name: "Sarah M.",
      role: "Medizinstudentin, 4. Jahr",
      tier: "Exam Pro",
      useCase: "Staatsexamen",
      text: "Anki+ hat mein Physikum gerettet. Der Deep Mode ist wie ein persönlicher Professor, der 24/7 in meiner Tasche ist. Komplexe Zusammenhänge endlich verstanden.",
      verified: true
    },
    {
      name: "Jonas K.",
      role: "Jura Student, LMU",
      tier: "Student",
      useCase: "Jura",
      text: "Endlich verstehe ich die Zusammenhänge zwischen den Paragraphen, statt nur auswendig zu lernen. Gamechanger für mein Staatsexamen.",
      verified: false
    },
    {
      name: "Dr. Lisa Weber",
      role: "Assistenzärztin",
      tier: "Exam Pro",
      useCase: "Facharzt",
      text: "Ich nutze ANKI+ zum Auffrischen von Facharztwissen. Die Deep Search Funktion spart mir täglich Stunden an Recherchezeit.",
      verified: true
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-6 sm:p-8 md:p-10 rounded-3xl relative bg-neutral-900/30 animate-pulse">
            <div className="h-32 bg-white/5 rounded-lg mb-6" />
            <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
            <div className="h-4 bg-white/5 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  // Use fallback if no testimonials and fallback is enabled
  const displayTestimonials = testimonials.length > 0 
    ? testimonials.map((t, idx) => ({
        name: `Nutzer ${idx + 1}`,
        role: t.tier === 'tier2' ? 'Exam Pro Nutzer' : 'Student Nutzer',
        tier: t.tier === 'tier2' ? 'Exam Pro' : 'Student',
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

  if (displayTestimonials.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {displayTestimonials.map((testimonial, i) => {
        const TierIcon = testimonial.tierInfo?.icon || Star;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-6 sm:p-8 md:p-10 rounded-3xl relative bg-neutral-900/30 hover:bg-neutral-900/50 transition-colors"
          >
            <Quote className="w-10 h-10 text-teal-500/10 absolute top-8 right-8" />
            <p className="text-neutral-300 leading-relaxed mb-6 relative z-10 text-lg font-light">
              "{testimonial.text}"
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {testimonial.tierInfo && (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  testimonial.tier === 'Exam Pro' 
                    ? `${testimonial.tierInfo.bg} ${testimonial.tierInfo.color} ${testimonial.tierInfo.border} border`
                    : `${testimonial.tierInfo.bg} ${testimonial.tierInfo.color} ${testimonial.tierInfo.border} border`
                }`}>
                  <TierIcon size={12} className="inline mr-1" />
                  {testimonial.tier}
                </span>
              )}
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/5 text-neutral-400 border border-white/10">
                {testimonial.useCase}
              </span>
              {testimonial.verified && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30 flex items-center gap-1">
                  <BadgeCheck className="w-3 h-3" />
                  Verifiziert
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                {testimonial.name.charAt(0)}
              </div>
              <div>
                <div className="font-semibold text-white text-base">{testimonial.name}</div>
                <div className="text-teal-500/80 text-sm">{testimonial.role}</div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

