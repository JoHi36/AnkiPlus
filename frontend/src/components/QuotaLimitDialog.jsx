import React, { useState } from 'react';
import { X, Sparkles, Zap, ExternalLink, Key } from 'lucide-react';

/**
 * Quota Limit Dialog
 * Wird angezeigt, wenn ein anonymer User sein Tageslimit erreicht hat
 */
export default function QuotaLimitDialog({ isOpen, onClose, onEnterCode, onOpenWebsite, limit, used }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-base-100 rounded-2xl shadow-2xl border border-base-300 overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-orange-500/20 via-red-500/20 to-pink-500/20 border-b border-base-300">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-base-200/50 hover:bg-base-300/70 text-base-content/70 hover:text-base-content transition-all"
          >
            <X size={18} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-base-content">
                Tageslimit erreicht
              </h2>
              <p className="text-sm text-base-content/60">
                {used}/{limit} Flash-Nachrichten verwendet
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-5">
          <div className="space-y-3">
            <p className="text-base-content/80 leading-relaxed">
              Du hast dein tägliches Limit von <strong>{limit} Flash-Nachrichten</strong> erreicht.
            </p>
            
            <div className="bg-base-200/50 rounded-xl p-4 space-y-2 border border-base-300">
              <p className="text-sm font-semibold text-base-content mb-2">
                Kostenlos registrieren und erhalten:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-base-content/80">
                  <Sparkles className="w-4 h-4 text-teal-400 flex-shrink-0" />
                  <span>Unbegrenzt Flash Mode</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-base-content/80">
                  <Sparkles className="w-4 h-4 text-teal-400 flex-shrink-0" />
                  <span>3x Deep Mode pro Tag</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={onEnterCode}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30"
            >
              <Key size={18} />
              <span>Code eingeben</span>
            </button>
            
            <button
              onClick={onOpenWebsite}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-base-200 hover:bg-base-300 text-base-content font-medium rounded-xl transition-all border border-base-300"
            >
              <ExternalLink size={18} />
              <span>Zur Website</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

