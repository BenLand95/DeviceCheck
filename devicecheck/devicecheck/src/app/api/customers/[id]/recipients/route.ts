import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const recipients = await prisma.customerRecipient.findMany({
    where: { customerId: params.id },
    orderBy: { email: 'asc' },
  });

  return NextResponse.json({ recipients });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { email } = body;

  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const recipient = await prisma.customerRecipient.create({
    data: {
      customerId: params.id,
      email: email.toLowerCase().trim(),
    },
  });

  return NextResponse.json({ recipient }, { status: 201 });
}

export async function PATCH(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, enabled } = body;

  if (!id) {
    return NextResponse.json({ error: 'Recipient ID required' }, { status: 400 });
  }

  const recipient = await prisma.customerRecipient.update({
    where: { id },
    data: { enabled },
  });

  return NextResponse.json({ recipient });
}

export async function DELETE(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const recipientId = searchParams.get('recipientId');

  if (!recipientId) {
    return NextResponse.json({ error: 'Recipient ID required' }, { status: 400 });
  }

  await prisma.customerRecipient.delete({ where: { id: recipientId } });
  return NextResponse.json({ success: true });
}
