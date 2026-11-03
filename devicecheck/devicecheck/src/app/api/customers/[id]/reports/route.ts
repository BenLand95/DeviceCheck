import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { enqueueReport } from '@/lib/queue';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reports = await prisma.report.findMany({
    where: { customerId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ reports });
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

  let sendEmail = true;
  try {
    const body = await request.json();
    if (body.sendEmail !== undefined) sendEmail = body.sendEmail;
  } catch {
    // No body provided, default sendEmail to true
  }

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: { devices: true },
  });

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  if (customer.devices.length === 0) {
    return NextResponse.json({ error: 'No devices to check' }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      customerId: params.id,
      runType: 'MANUAL',
      status: 'QUEUED',
    },
  });

  await enqueueReport(params.id, report.id, 'MANUAL', sendEmail);

  return NextResponse.json({ report });
}
