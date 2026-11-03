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

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      devices: { orderBy: { name: 'asc' } },
      recipients: { orderBy: { email: 'asc' } },
      schedules: { orderBy: { createdAt: 'asc' } },
      _count: { select: { devices: true, recipients: true, reports: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json({ customer });
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
  const {
    name,
    reportEnabled,
    reportTimezone,
    offlineThresholdSeconds,
    ticketThresholdSeconds,
    happyfoxContactId,
    reportOfflineOnly,
    reflectviewUrl,
    xytePduEnabled,
    pduRebootThreshold,
  } = body;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (reportEnabled !== undefined) updateData.reportEnabled = reportEnabled;
  if (reportTimezone !== undefined) updateData.reportTimezone = reportTimezone;
  if (offlineThresholdSeconds !== undefined) updateData.offlineThresholdSeconds = offlineThresholdSeconds;
  if (ticketThresholdSeconds !== undefined) updateData.ticketThresholdSeconds = ticketThresholdSeconds;
  if (happyfoxContactId !== undefined) updateData.happyfoxContactId = happyfoxContactId ? parseInt(happyfoxContactId) : null;
  if (reportOfflineOnly !== undefined) updateData.reportOfflineOnly = reportOfflineOnly;
  if (reflectviewUrl !== undefined) updateData.reflectviewUrl = reflectviewUrl || null;
  if (xytePduEnabled !== undefined) updateData.xytePduEnabled = xytePduEnabled;
  if (pduRebootThreshold !== undefined) {
    const val = parseInt(pduRebootThreshold);
    if (!isNaN(val) && val >= 1) {
      // Cap at 50% of device count (validated server-side)
      const deviceCount = await prisma.device.count({ where: { customerId: params.id } });
      const maxThreshold = Math.max(1, Math.floor(deviceCount / 2));
      updateData.pduRebootThreshold = Math.min(val, maxThreshold);
    }
  }

  const customer = await prisma.customer.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ customer });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.customer.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
