import { AuthProvider } from '@/components/auth-provider';
import { Sidebar } from '@/components/sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthProvider>
  );
}
