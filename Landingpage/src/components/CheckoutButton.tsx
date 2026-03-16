import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@shared/components/Button';
import { Loader2 } from 'lucide-react';

interface CheckoutButtonProps {
  tier: 'tier1' | 'tier2';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  children?: React.ReactNode;
}

export function CheckoutButton({ 
  tier, 
  className = '',
  size = 'lg',
  variant = 'primary',
  children 
}: CheckoutButtonProps) {
  const { user, getAuthToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (!user) {
      setError('Bitte melde dich zuerst an');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication token not available');
      }

      // Get API URL from environment or use relative path
      const apiUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';
      
      const response = await fetch(`${apiUrl}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create checkout session');
      }

      const data = await response.json();
      
      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      setError(error.message || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      setLoading(false);
    }
  };

  const tierName = tier === 'tier1' ? 'Student' : 'Exam Pro';
  const tierPrice = tier === 'tier1' ? '5€' : '15€';

  return (
    <div className={className}>
      <Button
        onClick={handleCheckout}
        disabled={loading || !user}
        size={size}
        variant={variant}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Lädt...
          </>
        ) : (
          children || `Jetzt upgraden (${tierPrice}/Monat)`
        )}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}

