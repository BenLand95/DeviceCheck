import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect('/setup');
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  redirect('/dashboard');
}
