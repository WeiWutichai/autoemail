'use client';

import {
  Ban,
  Database,
  FileText,
  History,
  LogOut,
  Mail,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/connections', label: 'Connections', icon: Database },
  { href: '/sync', label: 'Sync', icon: RefreshCw },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/suppressions', label: 'รายชื่อห้ามส่ง', icon: Ban },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/smtp', label: 'SMTP', icon: Mail },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/audit', label: 'Audit & PDPA', icon: History },
  { href: '/admin-users', label: 'Admin users', icon: ShieldCheck },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="px-5 py-4 text-lg font-semibold">ERP Mail Relay</div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted',
              pathname.startsWith(href) && 'bg-muted font-medium',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t p-4">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          ออกจากระบบ
        </Button>
      </div>
    </aside>
  );
}
