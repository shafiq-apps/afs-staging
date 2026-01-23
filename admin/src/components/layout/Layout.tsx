'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';
import AnimatedBackground from './AnimatedBackground';
import { User } from '@/types/auth';
import { LoadingBar } from '@/components/ui/LoadingBar';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <LoadingBar loading={true} />
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative transition-colors duration-200">
          <AnimatedBackground />
          <Navbar user={null} />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
          </main>
        </div>
      </>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative transition-colors duration-200">
        <AnimatedBackground />
        <Navbar user={user} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          {children}
        </main>
      </div>
    </>
  );
}

