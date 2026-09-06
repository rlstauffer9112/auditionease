import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export const VerifyPage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const { verifyToken } = useAuth();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      verifyToken(token)
        .then(() => {
          if (cancelled) return;
          setStatus('success');
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        })
        .catch((err: any) => {
          if (cancelled) return;
          setStatus('error');
          setError(err.message);
        });
    } else {
      setStatus('error');
      setError('No token provided');
    }

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm text-center"
      >
        {status === 'loading' && (
          <div className="space-y-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-[#5A5A40] animate-spin" />
            </div>
            <h2 className="text-2xl font-serif font-medium">Verifying your login link...</h2>
            <p className="text-gray-600">Please wait while we validate your session.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-serif font-medium text-green-600">Login Successful!</h2>
            <p className="text-gray-600">Redirecting you to the dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-serif font-medium text-red-600">Verification Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button 
              onClick={() => window.location.href = '/auth'}
              className="w-full bg-[#5A5A40] text-white rounded-xl py-3 font-medium hover:bg-[#4A4A30] transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
