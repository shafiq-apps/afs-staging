'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { images } from '@/lib/images';
import LoginForm from '@/components/auth/LoginForm';
import OTPForm from '@/components/auth/OTPForm';
import PINForm from '@/components/auth/PINForm';
import AnimatedBackground from '@/components/layout/AnimatedBackground';

type LoginStep = 'email' | 'otp' | 'pin';

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          // User is logged in, redirect to dashboard
          router.push('/dashboard');
          router.refresh();
          return;
        }
      } catch (error) {
        // Not logged in, continue to login page
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleOTPSent = (userEmail: string) => {
    setEmail(userEmail);
    setStep('otp');
  };

  const handleRequiresPin = () => {
    setStep('pin');
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative bg-slate-950">
        <AnimatedBackground />
        <div className="w-full max-w-md relative z-10 animate-login-entrance">
          <div className="login-panel">
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-500/50 border-t-slate-400/80"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative bg-slate-950">
      <AnimatedBackground />
      
      {/* Multiple elegant glows behind card for depth and elegance */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        {/* Primary blue glow - top left */}
        <div className="absolute w-[700px] h-[700px] bg-blue-500/8 rounded-full blur-[120px] animate-glow-drift-1"></div>
        {/* Violet glow - center right */}
        <div className="absolute w-[600px] h-[600px] bg-violet-500/6 rounded-full blur-[110px] animate-glow-drift-2"></div>
        {/* Indigo glow - bottom center */}
        <div className="absolute w-[550px] h-[550px] bg-blue-500/7 rounded-full blur-[100px] animate-glow-drift-3"></div>
        {/* Cyan accent glow - top right */}
        <div className="absolute w-[450px] h-[450px] bg-cyan-500/5 rounded-full blur-[95px] animate-glow-drift-1" style={{ animationDelay: '2s' }}></div>
        {/* Purple accent glow - bottom left */}
        <div className="absolute w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[105px] animate-glow-drift-2" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-login-entrance">
        <div className="login-panel">
          {/* Additional glow layers */}
          <div className="glow-layer-1"></div>
          <div className="glow-layer-2"></div>
          <div className="glow-layer-3"></div>
          <div className="corner-glow-top-left"></div>
          <div className="corner-glow-bottom-right"></div>
          
          <div className="text-center mb-10 relative z-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-xl bg-slate-800/40 backdrop-blur-sm border border-slate-700/30 flex items-center justify-center shadow-lg">
                <Image
                  src={images.smallIcon}
                  alt="DigitalCoo Logo"
                  width={48}
                  height={48}
                  className="w-12 h-12"
                />
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-slate-100 mb-2 tracking-tight">
              DigitalCoo Admin
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              {step === 'email' && 'Sign in to your account'}
              {step === 'otp' && 'Enter verification code'}
              {step === 'pin' && 'Super Admin PIN Required'}
            </p>
          </div>

          <div className="relative z-10">
            {step === 'email' && <LoginForm onOTPSent={handleOTPSent} />}
            {step === 'otp' && (
              <OTPForm email={email} onRequiresPin={handleRequiresPin} />
            )}
            {step === 'pin' && <PINForm email={email} />}
          </div>

          {step !== 'email' && (
            <div className="mt-8 text-center relative z-10">
              <button
                onClick={() => {
                  setStep('email');
                  setEmail('');
                }}
                className="text-sm text-slate-400 hover:text-slate-300 transition-colors duration-300 font-medium cursor-pointer"
              >
                ← Back to email
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 text-center relative z-10">
          <p className="text-xs text-slate-500 font-medium tracking-wide">
            Secure login with email verification
          </p>
        </div>
      </div>
    </div>
  );
}

