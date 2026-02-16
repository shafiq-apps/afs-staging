'use client';

import { useState } from 'react';

interface LoginFormProps {
  onOTPSent: (email: string) => void;
}

export default function LoginForm({ onOTPSent }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      onOTPSent(email);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const hasValue = email.length > 0;
  const isActive = focused || hasValue;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="relative">
        <div className="relative">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            required
            className="login-input w-full px-4 pt-7 pb-3 bg-slate-800/20 backdrop-blur-md border border-slate-700/30 rounded-lg text-slate-100 placeholder-transparent focus:outline-none focus:border-slate-600/40 focus:ring-0 transition-all duration-300 font-medium text-sm dark:[color-scheme:dark]"
            placeholder=" "
            disabled={loading}
          />
          <label
            htmlFor="email"
            className={`absolute left-4 transition-all duration-300 pointer-events-none font-medium text-sm ${
              isActive
                ? 'top-2 text-slate-400 text-xs'
                : 'top-4 text-slate-500'
            }`}
          >
            Email Address
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-blue-900/40 text-blue-300 px-4 py-3 rounded-lg text-sm font-medium backdrop-blur-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="login-button w-full bg-slate-800/60 text-slate-100 py-3.5 rounded-lg font-semibold text-sm tracking-wide hover:bg-slate-800/80 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-300 border border-slate-700/30"
      >
        {loading ? 'Sending...' : 'Send Login Code'}
      </button>
    </form>
  );
}

