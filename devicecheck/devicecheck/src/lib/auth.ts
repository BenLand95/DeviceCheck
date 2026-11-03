import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

export interface SessionData {
  userId?: string;
  email?: string;
  role?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_000',
  cookieName: 'devicecheck_session',
  cookieOptions: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true, enabled: true },
  });
  if (!user || !user.enabled) return null;
  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') {
    throw new Error('Forbidden');
  }
  return user;
}
