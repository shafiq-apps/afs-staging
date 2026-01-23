'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, LogOut, Menu, X } from 'lucide-react';
import Image from 'next/image';
import { images } from '@/lib/images';
import { User as UserType } from '@/types/auth';

interface NavbarProps {
  user: UserType | null;
}

export default function Navbar({ user }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/team', label: 'Team', requiresPermission: 'canManageTeam' },
    { href: '/shops', label: 'Shops', requiresPermission: 'canManageShops' },
    { href: '/payments', label: 'Payments', requiresPermission: 'canViewPayments' },
    { href: '/subscriptions', label: 'Subscriptions', requiresPermission: 'canViewSubscriptions' },
    { href: '/subscription-plans', label: 'Subscription Plans', requiresPermission: 'canViewSubscriptions' },
  ];

  // Show all navigation items - permission checks happen at page level
  const filteredNavItems = navItems;

  return (
    <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200/50 dark:border-slate-700/50 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center space-x-3">
              <Image
                src={images.logo}
                alt="DigitalCoo Logo"
                width={40}
                height={40}
                className="w-10 h-10"
              />
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">DigitalCoo</span>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium cursor-pointer ${
                    pathname === item.href
                      ? 'border-purple-500 text-gray-900 dark:text-gray-100'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-purple-300 dark:hover:border-purple-600 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            <div className="hidden sm:ml-4 sm:flex sm:items-center sm:space-x-4">
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900 focus:outline-none cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white font-medium shadow-md shadow-purple-500/50">
                    {user?.name.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="hidden md:block text-gray-700 dark:text-gray-300">{user?.name || 'User'}</span>
                </button>

                {profileMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setProfileMenuOpen(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-48 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-md shadow-lg py-1 z-20 border border-gray-200/50 dark:border-slate-700/50">
                      <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {user?.role.replace('_', ' ').toUpperCase()}
                        </p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center space-x-2 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="sm:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 cursor-pointer"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-200 dark:border-slate-700">
          <div className="pt-2 pb-3 space-y-1">
            {filteredNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium cursor-pointer ${
                  pathname === item.href
                    ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-500 dark:border-purple-600 text-purple-700 dark:text-purple-300'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-600 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-gray-200 dark:border-slate-700 pt-4 pb-3">
              <div className="px-4 mb-3">
                <p className="text-base font-medium text-gray-800 dark:text-gray-200">{user?.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-base font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

