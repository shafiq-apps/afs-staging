'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface OTPFormProps {
  email: string;
  onRequiresPin: () => void;
}

export default function OTPForm({ email, onRequiresPin }: OTPFormProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Focus first input
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Only last character
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = pastedData.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = code.join('');
    if (otpCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid OTP code');
      }

      if (data.requiresPin) {
        onRequiresPin();
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid code. Please try again.';
      setError(message);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resend OTP');
      }

      setResendCooldown(60); // 60 second cooldown
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend code';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-6 text-center text-slate-300">
          Enter the 6-digit code sent to your email
        </label>
        <div className="flex gap-3 justify-center">
          {code.map((digit, index) => (
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
              className="otp-input w-14 h-16 text-center text-2xl font-semibold border border-slate-700/30 rounded-lg bg-slate-800/20 backdrop-blur-md text-slate-100 focus:outline-none focus:border-slate-600/40 focus:ring-0 transition-all duration-300 disabled:opacity-50 dark:[color-scheme:dark]"
              disabled={loading}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-blue-900/40 text-blue-300 px-4 py-3 rounded-lg text-sm font-medium backdrop-blur-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || code.join('').length !== 6}
        className="login-button w-full bg-slate-800/60 text-slate-100 py-3.5 rounded-lg font-semibold text-sm tracking-wide hover:bg-slate-800/80 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-300 border border-slate-700/30"
      >
        {loading ? 'Verifying...' : 'Verify Code'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || loading}
          className="text-sm text-slate-400 hover:text-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer transition-colors duration-300 font-medium"
        >
          {resendCooldown > 0
            ? `Resend code in ${resendCooldown}s`
            : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

