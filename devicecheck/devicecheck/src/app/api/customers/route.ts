import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { devices: true, recipients: true, reports: true, schedules: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: { name: name.trim() },
  });

  return NextResponse.json({ customer }, { status: 201 });
}
