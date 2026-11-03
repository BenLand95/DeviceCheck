import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getPlayers } from '@/lib/reflectview';

export async function POST(
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
      devices: {
        where: { system: 'REFLECTVIEW' },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  console.log(`[RV Sync] Starting sync for customer: ${customer.name} (ID: ${customer.id})`);
  console.log(`[RV Sync] Current device count in DB: ${customer.devices.length}`);

  if (!customer.reflectviewUrl) {
    return NextResponse.json(
      { error: 'No ReflectView server URL configured for this customer' },
      { status: 400 },
    );
  }

  let players;
  try {
    console.log(`[RV Sync] Fetching players from: ${customer.reflectviewUrl}`);
    players = await getPlayers(customer.reflectviewUrl);
    console.log(`[RV Sync] ✓ Received ${players.length} players from ReflectView API`);
    
    if (players.length > 0) {
      console.log(`[RV Sync] Sample player data (first player):`, {
        uid: players[0].uid,
        name: players[0].name,
        networkName: players[0].networkName,
        connectivity: players[0].connectivity,
      });
    }
    
    if (players.length < 50) {
      console.log(`[RV Sync] All player UIDs:`, players.map(p => p.uid));
    }
  } catch (err) {
    console.error('[RV Sync] ✗ Failed to fetch players:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch players from ReflectView server' },
      { status: 502 },
    );
  }

  const existingByUid = new Map(
    customer.devices.map((d) => [d.signageosDeviceUid, d]),
  );
  const remoteUids = new Set(players.map((p) => p.uid));

  console.log(`[RV Sync] Processing: ${customer.devices.length} existing devices, ${players.length} remote players`);

  // Add new players
  const toAdd = players.filter((p) => !existingByUid.has(p.uid));
  console.log(`[RV Sync] Players to add: ${toAdd.length}`);
  if (toAdd.length > 0 && toAdd.length <= 20) {
    console.log(`[RV Sync] New player UIDs:`, toAdd.map(p => ({ uid: p.uid, name: p.name })));
  }
  let added = 0;
  if (toAdd.length > 0) {
    console.log(`[RV Sync] Creating ${toAdd.length} new devices...`);
    const result = await prisma.device.createMany({
      data: toAdd.map((p) => ({
        customerId: params.id,
        name: p.name || p.networkName || p.uid,
        signageosDeviceUid: p.uid,
        networkName: p.networkName,
        system: 'REFLECTVIEW' as const,
      })),
      skipDuplicates: true,
    });
    added = result.count;
    console.log(`[RV Sync] ✓ Created ${added} new devices`);
  }

  // Update existing devices' networkName (in case it changed on the server)
  const toUpdate = players.filter((p) => existingByUid.has(p.uid));
  console.log(`[RV Sync] Players to update: ${toUpdate.length}`);
  
  let updated = 0;
  for (const p of toUpdate) {
    const existing = existingByUid.get(p.uid)!;
    if (existing.networkName !== p.networkName || existing.name !== (p.name || p.networkName)) {
      await prisma.device.update({
        where: { id: existing.id },
        data: {
          networkName: p.networkName,
          name: p.name || p.networkName || p.uid,
        },
      });
      updated++;
    }
  }
  if (updated > 0) {
    console.log(`[RV Sync] ✓ Updated ${updated} existing devices`);
  }

  // Remove devices no longer on the server (but preserve devices with PDU config)
  const toRemove = customer.devices.filter(
    (d) => !remoteUids.has(d.signageosDeviceUid) && !d.pduDeviceId,
  );
  const preserved = customer.devices.filter(
    (d) => !remoteUids.has(d.signageosDeviceUid) && d.pduDeviceId,
  );
  
  console.log(`[RV Sync] Devices to remove: ${toRemove.length}`);
  console.log(`[RV Sync] Devices preserved (have PDU): ${preserved.length}`);
  
  let removed = 0;
  if (toRemove.length > 0) {
    console.log(`[RV Sync] Removing ${toRemove.length} devices no longer on server...`);
    if (toRemove.length <= 20) {
      console.log(`[RV Sync] Removing UIDs:`, toRemove.map(d => ({ uid: d.signageosDeviceUid, name: d.name })));
    }
    await prisma.device.deleteMany({
      where: {
        id: { in: toRemove.map((d) => d.id) },
      },
    });
    removed = toRemove.length;
    console.log(`[RV Sync] ✓ Removed ${removed} devices`);
  }

  const unchanged = toUpdate.length - updated;

  console.log(`[RV Sync] ===== SYNC COMPLETE =====`);
  console.log(`[RV Sync] Total players from API: ${players.length}`);
  console.log(`[RV Sync] Added: ${added}, Updated: ${updated}, Removed: ${removed}, Unchanged: ${unchanged}, Preserved: ${preserved.length}`);

  return NextResponse.json({
    total: players.length,
    added,
    removed,
    unchanged,
    preserved: preserved.length,
  });
}
