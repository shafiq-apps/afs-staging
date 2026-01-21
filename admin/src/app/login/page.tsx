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
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <AnimatedBackground />
        <div className="w-full max-w-md relative z-10">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <AnimatedBackground />
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src={images.smallIcon}
                alt="DigitalCoo Logo"
                width={64}
                height={64}
                className="w-16 h-16"
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ color: '#111827' }}>
              DigitalCoo Admin
            </h1>
            <p className="text-gray-700" style={{ color: '#374151' }}>
              {step === 'email' && 'Sign in to your account'}
              {step === 'otp' && 'Enter verification code'}
              {step === 'pin' && 'Super Admin PIN Required'}
            </p>
          </div>

          {step === 'email' && <LoginForm onOTPSent={handleOTPSent} />}
          {step === 'otp' && (
            <OTPForm email={email} onRequiresPin={handleRequiresPin} />
          )}
          {step === 'pin' && <PINForm email={email} />}

          {step !== 'email' && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setStep('email');
                  setEmail('');
                }}
                className="text-sm cursor-pointer" style={{ color: '#4b5563' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#111827'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#4b5563'}
              >
                ← Back to email
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm" style={{ color: '#ffffff' }}>
          <p>Secure login with email verification</p>
        </div>
      </div>
    </div>
  );
}

