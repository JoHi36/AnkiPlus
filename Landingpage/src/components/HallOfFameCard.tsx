import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Crown, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { getUserTestimonial } from '../utils/testimonialService';
import { getApprovedTestimonials } from '../utils/testimonialService';
import { TestimonialDocument } from '../utils/testimonialTypes';

export function HallOfFameCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [userTestimonial, setUserTestimonial] = useState<TestimonialDocument | null>(null);
  const [previewTestimonials, setPreviewTestimonials] = useState<TestimonialDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then(setUserDoc);
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load user's testimonial
      if (user) {
        const testimonial = await getUserTestimonial(user.uid);
        setUserTestimonial(testimonial || null);
      }

      // Load preview testimonials (for non-premium blur effect)
      const approved = await getApprovedTestimonials(3);
      setPreviewTestimonials(approved);
    } catch (error) {
      console.error('Error loading hall of fame data:', error);
    } finally {
      setLoading(false);
    }
  };

  const isPremium = userDoc?.tier === 'tier1' || userDoc?.tier === 'tier2';
  const hasTestimonial = !!userTestimonial;

  if (loading) {
    return (
      <div className="rounded-2xl p-6 border border-white/5 bg-[#0A0A0A] animate-pulse">
        <div className="h-24 bg-white/5 rounded-lg" />
      </div>
    );
  }

  // Premium User - Full Access
  if (isPremium) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 border border-white/5 bg-[#0A0A0A] relative overflow-hidden group hover:border-teal-500/30 transition-all"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Star size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">Hall of Fame</h3>
              <p className="text-xs text-neutral-400">Teile deine Erfahrung mit ANKI+</p>
            </div>
            {hasTestimonial && userTestimonial?.status === 'approved' && (
              <div className="px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium">
                Aktiv
              </div>
            )}
          </div>

          {hasTestimonial ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-black/20 border border-white/5">
                <p className="text-sm text-neutral-300 italic line-clamp-3">
                  "{userTestimonial.text}"
                </p>
                {userTestimonial.status === 'pending' && (
                  <p className="mt-2 text-xs text-yellow-400">
                    Wird moderiert und erscheint nach Freigabe
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate('/dashboard/settings')}
                className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium transition-all flex items-center justify-center gap-2"
              >
                <Star size={16} />
                Testimonial bearbeiten
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-neutral-400">
                Werde Teil unserer Community und teile deine Erfahrung mit ANKI+.
              </p>
              <button
                onClick={() => navigate('/dashboard/settings')}
                className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-900/40"
              >
                <Star size={16} />
                Testimonial schreiben
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Non-Premium User - Locked with subtle CTA
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6 border border-white/5 bg-[#0A0A0A] relative overflow-hidden group"
    >
      {/* Blurred Overlay */}
      <div className="absolute inset-0 backdrop-blur-[2px] bg-black/20 z-10" />
      
      <div className="relative z-20">
        {/* Header with Premium Badge */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 opacity-60">
            <Star size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white/80">Hall of Fame</h3>
              <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold uppercase tracking-wider">
                Premium
              </span>
            </div>
            <p className="text-xs text-neutral-500">Exklusiv für Premium-Nutzer</p>
          </div>
          <Lock className="w-5 h-5 text-teal-400/60" />
        </div>

        {/* Blurred Preview */}
        {previewTestimonials.length > 0 && (
          <div className="mb-4 space-y-2 opacity-40 blur-[1px]">
            {previewTestimonials.slice(0, 2).map((testimonial, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-black/20 border border-white/5">
                <p className="text-xs text-neutral-400 italic line-clamp-2">
                  "{testimonial.text.substring(0, 100)}..."
                </p>
              </div>
            ))}
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={() => navigate('/dashboard/subscription')}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-900/30 group/btn"
        >
          <Crown size={16} />
          Premium freischalten
          <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
        </button>

        {/* Subtle Hint */}
        <p className="mt-3 text-xs text-center text-neutral-500">
          Werde Teil der Community und teile deine Erfahrung
        </p>
      </div>
    </motion.div>
  );
}

