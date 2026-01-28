'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface PINFormProps {
  email: string;
}

export default function PINForm({ email }: PINFormProps) {
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pinSent, setPinSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Auto-send PIN on mount
    sendPIN();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (pinSent) {
      inputRefs.current[0]?.focus();
    }
  }, [pinSent]);

  const sendPIN = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send PIN');
      }

      setPinSent(true);
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send PIN code');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d{6}$/.test(pastedData)) {
      const newPin = pastedData.split('');
      setPin(newPin);
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pinCode = pin.join('');
    if (pinCode.length !== 6) {
      setError('Please enter a 6-digit PIN');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin: pinCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid PIN code');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Invalid PIN. Please try again.');
      setPin(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await sendPIN();
  };

  if (!pinSent) {
    return (
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-500/50 border-t-slate-400/80 mx-auto mb-4"></div>
        <p className="text-slate-400 font-medium text-sm">Sending PIN code to your email...</p>
        {error && (
          <div className="mt-4 bg-red-950/30 border border-red-900/40 text-red-300 px-4 py-3 rounded-lg text-sm font-medium backdrop-blur-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-4 mb-4 backdrop-blur-sm">
        <p className="text-sm text-amber-200/90 font-medium">
          <strong className="font-semibold">Super Admin Access:</strong> A PIN code has been sent to your email. This code expires in 5 minutes.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-6 text-center text-slate-300">
          Enter your 6-digit PIN code
        </label>
        <div className="flex gap-3 justify-center">
          {pin.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className="pin-input w-14 h-16 text-center text-2xl font-semibold border border-amber-900/30 rounded-lg bg-slate-800/20 backdrop-blur-md text-slate-100 focus:outline-none focus:border-amber-800/50 focus:ring-0 transition-all duration-300 disabled:opacity-50"
              disabled={loading}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/40 text-red-300 px-4 py-3 rounded-lg text-sm font-medium backdrop-blur-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || pin.join('').length !== 6}
        className="login-button w-full bg-slate-800/60 text-slate-100 py-3.5 rounded-lg font-semibold text-sm tracking-wide hover:bg-slate-800/80 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-300 border border-slate-700/30"
      >
        {loading ? 'Verifying...' : 'Verify PIN'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || loading}
          className="text-sm text-slate-400 hover:text-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer transition-colors duration-300 font-medium"
        >
          {resendCooldown > 0
            ? `Resend PIN in ${resendCooldown}s`
            : 'Resend PIN'}
        </button>
      </div>
    </form>
  );
}

