import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, XCircle, Copy, RefreshCw, Key, Loader2 } from 'lucide-react';
import { copyToClipboard } from '../utils/deepLink';

export function ConnectionStatusCard() {
  const { user, getAuthToken } = useAuth();
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isConnected, setIsConnected] = useState(false); // TODO: Check actual connection status from backend

  useEffect(() => {
    loadToken();
    // TODO: Check actual connection status from backend
    // For now, we assume not connected if we need to show the token
  }, [user]);

  const loadToken = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getAuthToken();
      setIdToken(token);
    } catch (error) {
      console.error('Error loading token:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (idToken) {
      const success = await copyToClipboard(idToken);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    }
  };

  const handleRefreshToken = async () => {
    await loadToken();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden h-full"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${
          isConnected 
            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
        }`}>
          {isConnected ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">Anki Verbindung</h3>
          <p className="text-xs text-neutral-400">
            {isConnected ? 'Verbunden' : 'Nicht verbunden'}
          </p>
        </div>
      </div>

      {!isConnected && (
        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
          <p className="text-xs text-orange-300">
            Kopiere den Token und füge ihn in Anki ein, um die Verbindung herzustellen.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-2 text-neutral-400">
            Auth-Token
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-[#111] border border-white/5 rounded-lg text-white text-xs font-mono flex items-center gap-2">
              <Key size={14} className="text-neutral-500 flex-shrink-0" />
              {loading ? (
                <span className="text-neutral-500">Lädt...</span>
              ) : idToken ? (
                <span className="truncate">{idToken.substring(0, 30)}...</span>
              ) : (
                <span className="text-neutral-500">Token wird geladen...</span>
              )}
            </div>
            <button
              onClick={handleCopyToken}
              disabled={!idToken || loading}
              className={`px-3 py-2 border rounded-lg transition-colors flex-shrink-0 ${
                copied
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-neutral-400 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Token kopieren"
            >
              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            </button>
            <button
              onClick={handleRefreshToken}
              disabled={loading}
              className="px-3 py-2 border border-white/10 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors disabled:opacity-50 flex-shrink-0"
              title="Token aktualisieren"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {copied && (
            <p className="mt-2 text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} />
              Token kopiert!
            </p>
          )}
        </div>

        <div className="pt-3 border-t border-white/5">
          <p className="text-xs text-neutral-500 leading-relaxed">
            Öffne Anki → Chatbot-Panel (Cmd+I) → Profil → Token einfügen
          </p>
        </div>
      </div>
    </motion.div>
  );
}
