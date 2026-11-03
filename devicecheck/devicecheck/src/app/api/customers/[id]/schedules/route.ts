import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const VALID_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schedules = await prisma.reportSchedule.findMany({
    where: { customerId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ schedules });
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
  const { frequency, time, dayOfWeek, dayOfMonth, sendEmail } = body;

  if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  }

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Invalid time format (HH:MM)' }, { status: 400 });
  }

  if (frequency === 'WEEKLY' && (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)) {
    return NextResponse.json({ error: 'Day of week required (0-6)' }, { status: 400 });
  }

  if (frequency === 'MONTHLY' && (dayOfMonth === undefined || dayOfMonth < 1 || dayOfMonth > 28)) {
    return NextResponse.json({ error: 'Day of month required (1-28)' }, { status: 400 });
  }

  const schedule = await prisma.reportSchedule.create({
    data: {
      customerId: params.id,
      frequency,
      time,
      dayOfWeek: frequency === 'WEEKLY' ? dayOfWeek : null,
      dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : null,
      sendEmail: sendEmail !== undefined ? sendEmail : true,
    },
  });

  return NextResponse.json({ schedule }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, enabled, sendEmail, frequency, time, dayOfWeek, dayOfMonth } = body;

  if (!id) {
    return NextResponse.json({ error: 'Schedule ID required' }, { status: 400 });
  }

  if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  }

  if (time !== undefined && !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Invalid time format (HH:MM)' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (enabled !== undefined) updateData.enabled = enabled;
  if (sendEmail !== undefined) updateData.sendEmail = sendEmail;
  if (frequency !== undefined) {
    updateData.frequency = frequency;
    updateData.dayOfWeek = frequency === 'WEEKLY' ? (dayOfWeek ?? null) : null;
    updateData.dayOfMonth = frequency === 'MONTHLY' ? (dayOfMonth ?? null) : null;
  } else {
    if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek;
    if (dayOfMonth !== undefined) updateData.dayOfMonth = dayOfMonth;
  }
  if (time !== undefined) updateData.time = time;

  const schedule = await prisma.reportSchedule.update({
    where: { id, customerId: params.id },
    data: updateData,
  });

  return NextResponse.json({ schedule });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get('scheduleId');

  if (!scheduleId) {
    return NextResponse.json({ error: 'Schedule ID required' }, { status: 400 });
  }

  await prisma.reportSchedule.delete({
    where: { id: scheduleId, customerId: params.id },
  });

  return NextResponse.json({ success: true });
}
