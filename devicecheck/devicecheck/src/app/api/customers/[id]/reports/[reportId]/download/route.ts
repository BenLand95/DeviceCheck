import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
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

  if (!report || !report.filePath) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  if (!fs.existsSync(report.filePath)) {
    return NextResponse.json({ error: 'Report file not found on disk' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(report.filePath);
  const filename = path.basename(report.filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
