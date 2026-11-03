import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ needsSetup: count === 0 });
}

export async function POST(request: Request) {
  const count = await prisma.user.count();
  if (count > 0) {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 400 });
  }

  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'ADMIN',
    },
  });

  return NextResponse.json({ success: true });
}
