'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  role: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '◫' },
    { href: '/dashboard/customers', label: 'Customers', icon: '⊞' },
    ...(user?.role === 'ADMIN'
      ? [
          { href: '/dashboard/users', label: 'Users', icon: '⊕' },
          { href: '/dashboard/settings', label: 'Settings', icon: '⊛' },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex bg-[url('https://cri.com/hs-fs/hubfs/CRI-Leaf-Teal-Solo.png?width=250&height=250&name=CRI-Leaf-Teal-Solo.png')] bg-[length:200px_200px] bg-[position:right_15px_bottom_15px] bg-no-repeat">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} sticky top-0 h-screen shrink-0 bg-gray-900 text-white transition-all duration-200 flex flex-col`}
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {sidebarOpen && <h1 className="text-lg font-bold">DeviceCheck</h1>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-400 hover:text-white p-1"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white border-l-2 border-blue-500'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {sidebarOpen && <span className="ml-3">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          {sidebarOpen && (
            <div className="text-xs text-gray-400 mb-2 truncate">{user?.email}</div>
          )}
          <div className="flex flex-col gap-1">
            <Link
              href="/dashboard/password"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              {sidebarOpen ? 'Change Password' : '🔑'}
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors text-left"
            >
              {sidebarOpen ? 'Sign Out' : '⏻'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <div className="p-6 pb-[315px] max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
