import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['customer']);
  return <AppShell profile={profile}>{children}</AppShell>;
}
