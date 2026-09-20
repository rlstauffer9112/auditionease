import React, { useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { X } from 'lucide-react';

const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY || '');

interface CheckoutModalProps {
  plan: 'business' | 'enterprise';
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ plan, onClose }) => {
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const token = localStorage.getItem('sessionToken');
    const res = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error || 'Failed to start checkout');
      throw new Error(err.error);
    }

    const data = await res.json();
    return data.clientSecret;
  }, [plan]);

  const planNames: Record<string, string> = {
    business: 'Business',
    enterprise: 'Enterprise',
  };

  const planPrices: Record<string, string> = {
    business: '$19.95/mo',
    enterprise: '$49.95/mo',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#1A1A1A]">
              Subscribe to {planNames[plan]}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{planPrices[plan]}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          {error ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-gray-100 font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ fetchClientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>
    </div>
  );
};
