import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteAccountModal({ open, onClose, onConfirm }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const canDelete = confirmText === 'LÖSCHEN';

  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#141414] border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-[16px] font-semibold">Account löschen</h3>
        </div>
        <p className="text-[13px] text-white/[0.5] font-light mb-5 leading-relaxed">
          Dein Account und alle Daten werden permanent gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div className="mb-5">
          <label className="block text-[12px] text-white/[0.35] mb-1.5">
            Tippe <strong className="text-white/[0.7]">LÖSCHEN</strong> zur Bestätigung
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-red-500/30 transition-colors"
            placeholder="LÖSCHEN"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-[10px] border border-white/[0.08] text-[13px] text-white/[0.5] hover:bg-white/[0.04] transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || loading}
            className="flex-1 py-2.5 rounded-[10px] bg-red-500/20 border border-red-500/30 text-red-400 text-[13px] font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}
