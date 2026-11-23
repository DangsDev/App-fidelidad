import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['employee', 'admin']);
  return <AppShell profile={profile}>{children}</AppShell>;
}
