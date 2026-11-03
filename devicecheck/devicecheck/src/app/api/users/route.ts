import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, enabled: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { email, password, role } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'USER',
    },
    select: { id: true, email: true, role: true, enabled: true, createdAt: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { id, enabled, role, password } = body;

  if (!id) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (typeof enabled === 'boolean') updateData.enabled = enabled;
  if (role === 'ADMIN' || role === 'USER') updateData.role = role;
  if (password && password.length >= 8) {
    updateData.passwordHash = await bcrypt.hash(password, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, email: true, role: true, enabled: true, createdAt: true },
  });

  return NextResponse.json({ user });
}
