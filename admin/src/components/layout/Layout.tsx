// app/layout.tsx
import Navbar from './Navbar';
import AnimatedBackground from './AnimatedBackground';
import { User } from '@/types/auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt.utils';
import { getUserById, getUserByEmail, getOrCreateUserByEmail, getDefaultPermissions } from '@/lib/user.storage';

interface LayoutProps {
  children: React.ReactNode;
}

async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;

  const session = verifyToken(token);
  if (!session) return null;

  let user = await getUserById(session.userId);
  if (!user && session.email) user = await getUserByEmail(session.email);
  if (!user && session.email) user = await getOrCreateUserByEmail(session.email);

  if (!user || !user.isActive) return null;

  if (!user.permissions) user.permissions = getDefaultPermissions(user.role);

  return user;
}

export default async function Layout({ children }: LayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    // SERVER-SIDE redirect: user never sees the page
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 relative">
      <AnimatedBackground />
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        {children}
      </main>
    </div>
  );
}
