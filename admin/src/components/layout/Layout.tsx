// app/layout.tsx
import Navbar from './Navbar';
import AnimatedBackground from './AnimatedBackground';
import { User } from '@/types/auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AuthProvider } from '@/components/providers';
import { resolveAuthenticatedUserFromToken } from '@/lib/api-auth';

interface LayoutProps {
  children: React.ReactNode;
}

async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;
  return resolveAuthenticatedUserFromToken(token);
}

export default async function Layout({ children }: LayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    // SERVER-SIDE redirect: user never sees the page
    redirect('/login');
  }

  return (
    <AuthProvider initialUser={user}>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative">
        <AnimatedBackground />
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
