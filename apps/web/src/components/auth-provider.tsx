'use client';

import type { AdminUserDto } from '@erp-mail/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

interface AuthContextValue {
  user: AdminUserDto;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Restores the session from the refresh cookie before rendering admin pages. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUserDto | null>(() => api.getSession()?.user ?? null);

  useEffect(() => {
    if (user) {
      return;
    }
    let cancelled = false;
    void api.refresh().then((session) => {
      if (cancelled) {
        return;
      }
      if (session) {
        setUser(session.user);
      } else {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, router, pathname]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        กำลังโหลด…
      </div>
    );
  }

  const logout = async () => {
    await api.logout();
    router.replace('/login');
  };

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}
