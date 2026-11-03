import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { resolveDeviceNameToUid } from '@/lib/signageos';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const devices = await prisma.device.findMany({
    where: { customerId: params.id },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ devices });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const system = body.system || 'SIGNAGEOS';
  if (!['SIGNAGEOS', 'REFLECTVIEW'].includes(system)) {
    return NextResponse.json({ error: 'Invalid system. Must be SIGNAGEOS or REFLECTVIEW' }, { status: 400 });
  }

  // Support bulk import: array of lines, each can be "name" or "name,uid"
  if (Array.isArray(body.names)) {
    const lines: string[] = body.names.map((n: string) => n.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ error: 'No valid device names provided' }, { status: 400 });
    }

    // Parse lines: if a line contains a comma, treat as "name,uid"
    const withUid: { name: string; uid: string }[] = [];
    const needsResolution: string[] = [];

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 2 && parts[1]) {
        withUid.push({ name: parts[0], uid: parts[1] });
      } else {
        needsResolution.push(parts[0]);
      }
    }

    try {
      let resolved: { name: string; uid: string }[] = [...withUid];
      let unresolved: string[] = [];

      // Only call SignageOS API for devices that need UID resolution
      if (needsResolution.length > 0) {
        const result = await resolveDeviceNameToUid(needsResolution);
        resolved = [...resolved, ...result.resolved];
        unresolved = result.unresolved;
      }

      if (resolved.length === 0) {
        return NextResponse.json({
          error: `None of the ${lines.length} device names were found in SignageOS`,
          unresolved,
        }, { status: 400 });
      }

      const devices = await prisma.device.createMany({
        data: resolved.map((d) => ({
          customerId: params.id,
          name: d.name,
          signageosDeviceUid: d.uid,
          system,
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({
        count: devices.count,
        unresolved: unresolved.length > 0 ? unresolved : undefined,
      }, { status: 201 });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Failed to resolve device names',
      }, { status: 500 });
    }
  }

  // Support CSV re-import with UIDs and PDU fields (create or update)
  if (Array.isArray(body.devicesWithUid)) {
    let created = 0;
    let updated = 0;

    for (const d of body.devicesWithUid as { name: string; uid: string; pduDeviceId?: string | null; pduPort?: number | null }[]) {
      const existing = await prisma.device.findFirst({
        where: { customerId: params.id, signageosDeviceUid: d.uid.trim() },
      });

      if (existing) {
        // Update PDU fields on existing device
        const updateData: Record<string, unknown> = {};
        if (d.pduDeviceId !== undefined) updateData.pduDeviceId = d.pduDeviceId || null;
        if (d.pduPort !== undefined) updateData.pduPort = d.pduPort ?? null;
        if (d.name && d.name !== existing.name) updateData.name = d.name.trim();

        if (Object.keys(updateData).length > 0) {
          await prisma.device.update({ where: { id: existing.id }, data: updateData });
          updated++;
        }
      } else {
        // Create new device with PDU fields
        await prisma.device.create({
          data: {
            customerId: params.id,
            name: d.name.trim(),
            signageosDeviceUid: d.uid.trim(),
            system,
            pduDeviceId: d.pduDeviceId || null,
            pduPort: d.pduPort ?? null,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ count: created, updated }, { status: 201 });
  }

  // Support bulk import with explicit UIDs
  if (Array.isArray(body.devices)) {
    const devices = await prisma.device.createMany({
      data: body.devices.map((d: { name: string; signageosDeviceUid: string }) => ({
        customerId: params.id,
        name: d.name.trim(),
        signageosDeviceUid: d.signageosDeviceUid.trim(),
        system,
      })),
    });
    return NextResponse.json({ count: devices.count }, { status: 201 });
  }

  const { name, signageosDeviceUid } = body;

  if (!name || !signageosDeviceUid) {
    return NextResponse.json({ error: 'Name and device UID required' }, { status: 400 });
  }

  const device = await prisma.device.create({
    data: {
      customerId: params.id,
      name: name.trim(),
      signageosDeviceUid: signageosDeviceUid.trim(),
      system,
    },
  });

  return NextResponse.json({ device }, { status: 201 });
}

export async function PATCH(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { deviceId, ignored, pduDeviceId, pduPort } = body;

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (typeof ignored === 'boolean') updateData.ignored = ignored;
  if (pduDeviceId !== undefined) updateData.pduDeviceId = pduDeviceId || null;
  if (pduPort !== undefined) updateData.pduPort = pduPort !== null && pduPort !== '' ? parseInt(pduPort) : null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const device = await prisma.device.update({
    where: { id: deviceId },
    data: updateData,
  });

  return NextResponse.json({ device });
}

export async function DELETE(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  await prisma.device.delete({ where: { id: deviceId } });
  return NextResponse.json({ success: true });
}
