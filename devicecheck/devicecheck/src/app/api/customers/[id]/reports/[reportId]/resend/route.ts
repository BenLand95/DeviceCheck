import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { enqueueEmail } from '@/lib/queue';
import { prisma } from '@/lib/prisma';

export async function POST(
  _request: Request,
  { params }: { params: { id: string; reportId: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const report = await prisma.report.findUnique({
    where: { id: params.reportId, customerId: params.id },
  });

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  if (report.status !== 'COMPLETE' || !report.filePath) {
    return NextResponse.json({ error: 'Report is not complete or has no file' }, { status: 400 });
  }

  await enqueueEmail(report.id);

  return NextResponse.json({ success: true, message: 'Email queued for resend' });
}
