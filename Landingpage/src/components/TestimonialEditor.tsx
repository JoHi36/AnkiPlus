import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { saveTestimonial, getUserTestimonial, deleteTestimonial } from '../utils/testimonialService';
import { TestimonialDocument } from '../utils/testimonialTypes';

interface TestimonialEditorProps {
  onSaved?: () => void;
}

export function TestimonialEditor({ onSaved }: TestimonialEditorProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [currentTestimonial, setCurrentTestimonial] = useState<TestimonialDocument | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then(setUserDoc);
      loadTestimonial();
    }
  }, [user]);

  const loadTestimonial = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const testimonial = await getUserTestimonial(user.uid);
      if (testimonial) {
        setCurrentTestimonial(testimonial);
        setText(testimonial.text);
      }
    } catch (error) {
      console.error('Error loading testimonial:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !userDoc) return;

    const tier = userDoc.tier;
    if (tier === 'free') {
      setMessage({ type: 'error', text: 'Nur Premium-Nutzer können Testimonials verfassen' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const result = await saveTestimonial(user.uid, text, tier as 'tier1' | 'tier2');
      
      if (result.success) {
        setMessage({ 
          type: result.error ? 'info' : 'success', 
          text: result.error || 'Testimonial gespeichert!' 
        });
        await loadTestimonial();
        if (onSaved) onSaved();
      } else {
        setMessage({ type: 'error', text: result.error || 'Fehler beim Speichern' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Unerwarteter Fehler' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !currentTestimonial) return;
    if (!confirm('Möchtest du dein Testimonial wirklich löschen?')) return;

    setDeleting(true);
    try {
      const result = await deleteTestimonial(user.uid);
      if (result.success) {
        setCurrentTestimonial(null);
        setText('');
        setMessage({ type: 'success', text: 'Testimonial gelöscht' });
        if (onSaved) onSaved();
      } else {
        setMessage({ type: 'error', text: result.error || 'Fehler beim Löschen' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Unerwarteter Fehler' });
    } finally {
      setDeleting(false);
    }
  };

  const characterCount = text.length;
  const maxLength = 500;
  const isOverLimit = characterCount > maxLength;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  const isPremium = userDoc?.tier === 'tier1' || userDoc?.tier === 'tier2';
  if (!isPremium) {
    return (
      <div className="rounded-2xl p-6 border border-white/5 bg-[#0A0A0A]">
        <div className="flex items-center gap-3 mb-4">
          <Star className="w-5 h-5 text-teal-400" />
          <h3 className="font-semibold text-white">Hall of Fame</h3>
        </div>
        <p className="text-sm text-neutral-400 mb-4">
          Nur Premium-Nutzer können Testimonials verfassen und Teil der Hall of Fame werden.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-8 border border-white/5 bg-[#0A0A0A] relative overflow-hidden"
    >
      <div className="relative z-10">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-1">Hall of Fame Testimonial</h3>
          <p className="text-sm text-neutral-400">Teile deine Erfahrung mit ANKI+</p>
        </div>

        {/* Status Badge */}
        {currentTestimonial && (
          <div className={`mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            currentTestimonial.status === 'approved'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : currentTestimonial.status === 'pending'
              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {currentTestimonial.status === 'approved' && <CheckCircle2 size={14} />}
            {currentTestimonial.status === 'pending' && <Loader2 size={14} className="animate-spin" />}
            {currentTestimonial.status === 'rejected' && <AlertCircle size={14} />}
            Status: {
              currentTestimonial.status === 'approved' ? 'Freigegeben' :
              currentTestimonial.status === 'pending' ? 'Wird moderiert' :
              'Abgelehnt'
            }
          </div>
        )}

        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-3 rounded-lg flex items-start gap-2 text-sm ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : message.type === 'error'
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}
          >
            {message.type === 'success' && <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
            {message.type === 'error' && <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-current/60 hover:text-current"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}

        {/* Textarea */}
        <div className="mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Erzähle anderen, wie ANKI+ dir beim Lernen hilft..."
            className={`w-full h-32 px-4 py-3 rounded-xl bg-black/20 border ${
              isOverLimit
                ? 'border-red-500/50 focus:border-red-500'
                : 'border-white/5 focus:border-teal-500/50'
            } text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all resize-none`}
            maxLength={maxLength}
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-neutral-500">
              {isOverLimit && <span className="text-red-400">Zu lang! </span>}
              Mindestens 20 Zeichen
            </p>
            <span className={`text-xs font-medium ${
              isOverLimit
                ? 'text-red-400'
                : characterCount > maxLength * 0.9
                ? 'text-yellow-400'
                : 'text-neutral-400'
            }`}>
              {characterCount} / {maxLength}
            </span>
          </div>
        </div>

        {/* Preview */}
        {text.length >= 20 && !isOverLimit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 p-4 rounded-lg bg-black/20 border border-white/5"
          >
            <p className="text-xs text-neutral-400 mb-2">Vorschau:</p>
            <p className="text-sm text-neutral-300 italic">"{text}"</p>
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || isOverLimit || text.length < 20}
            className="flex-1 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <Star size={16} />
                {currentTestimonial ? 'Aktualisieren' : 'Veröffentlichen'}
              </>
            )}
          </button>
          
          {currentTestimonial && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="py-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <X size={16} />
                  Löschen
                </>
              )}
            </button>
          )}
        </div>

        {/* Info */}
        <p className="mt-4 text-xs text-neutral-500">
          Dein Testimonial wird automatisch moderiert. Es erscheint in der Hall of Fame, sobald es freigegeben wurde.
        </p>
      </div>
    </motion.div>
  );
}

