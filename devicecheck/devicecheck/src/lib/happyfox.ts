import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface HappyFoxConfig {
  baseUrl: string;
  apiKey: string;
  authCode: string;
  categoryId: number;
}

interface HappyFoxTicketResponse {
  id: number;
  display_id: string;
  status: {
    id: number;
    name: string;
    behavior: string; // "pending" (open), "closed" (closed)
  };
}

async function getHappyFoxConfig(): Promise<HappyFoxConfig | null> {
  const keys = [
    'happyfox_url',
    'happyfox_api_key',
    'happyfox_auth_code',
    'happyfox_category_id',
  ];

  const settings = await prisma.appSettings.findMany({
    where: { key: { in: keys } },
  });

  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }

  if (!map.happyfox_url || !map.happyfox_api_key || !map.happyfox_auth_code || !map.happyfox_category_id) {
    return null;
  }

  return {
    baseUrl: map.happyfox_url.replace(/\/$/, ''),
    apiKey: map.happyfox_api_key,
    authCode: map.happyfox_auth_code,
    categoryId: parseInt(map.happyfox_category_id, 10),
  };
}

function authHeader(config: HappyFoxConfig): string {
  const encoded = Buffer.from(`${config.apiKey}:${config.authCode}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Get a ticket by its ticket number from HappyFox.
 */
type TicketLookup =
  | { kind: 'found'; ticket: HappyFoxTicketResponse }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export async function getTicket(ticketId: number): Promise<TicketLookup> {
  const config = await getHappyFoxConfig();
  if (!config) {
    return { kind: 'error', message: 'HappyFox is not configured' };
  }

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/api/1.1/json/ticket/${ticketId}/`,
      {
        headers: {
          Authorization: authHeader(config),
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Network request failed',
    };
  }

  if (response.status === 404) {
    return { kind: 'not-found' };
  }

  if (!response.ok) {
    return {
      kind: 'error',
      message: `HappyFox returned ${response.status}`,
    };
  }

  try {
    const ticket: HappyFoxTicketResponse = await response.json();
    return { kind: 'found', ticket };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Invalid ticket response',
    };
  }
}

/**
 * Check if a HappyFox ticket is closed.
 * behavior === "closed" means the ticket is resolved/closed.
 * behavior === "pending" means the ticket is still open.
 */
export function isTicketClosed(ticket: HappyFoxTicketResponse): boolean {
  return ticket.status.behavior === 'closed';
}

/**
 * Create a new ticket in HappyFox.
 */
export async function createTicket(params: {
  contactId: number;
  subject: string;
  body: string;
}): Promise<HappyFoxTicketResponse | null> {
  const config = await getHappyFoxConfig();
  if (!config) {
    console.warn('HappyFox not configured, skipping ticket creation');
    return null;
  }

  const payload = {
    category: config.categoryId,
    user: params.contactId,
    subject: params.subject,
    text: params.body,
  };

  const response = await fetch(
    `${config.baseUrl}/api/1.1/json/tickets/`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader(config),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`HappyFox createTicket failed: ${response.status} - ${errorText}`);
    return null;
  }

  return response.json();
}

/**
 * Process ticket logic for a single offline device.
 *
 * Returns the ticket display ID (e.g. "#HFS00000001") or null.
 *
 * Logic:
 * 1. Check device_tickets for an open ticket for this device.
 * 2. If open ticket exists → query HappyFox to verify status.
 *    - If still open → return existing ticket ID (no new ticket).
 *    - If closed → mark as closed, create new ticket with incremented occurrence.
 * 3. If no open ticket → create new ticket (occurrence 1 or next).
 */
export async function handleOfflineDevice(
  deviceId: string,
  deviceName: string,
  contactId: number,
): Promise<string | null> {
  // Find the most recent ticket for this device
  const existingTicket = await prisma.deviceTicket.findFirst({
    where: { deviceId, status: 'open' },
    orderBy: { createdAt: 'desc' },
  });

  if (existingTicket) {
    console.log(`[HappyFox] Found existing open ticket for device ${deviceName}: ${existingTicket.ticketDisplayId} (ID: ${existingTicket.ticketId})`);

    const lookup = await getTicket(existingTicket.ticketId);

    if (lookup.kind === 'error') {
      console.error(
        `[HappyFox] Could not verify ticket ${existingTicket.ticketId}: ${lookup.message}. ` +
        'Keeping the local ticket open; not creating a replacement.',
      );
      return existingTicket.ticketDisplayId;
    }

    if (lookup.kind === 'found') {
      const hfTicket = lookup.ticket;
      console.log(`[HappyFox] Ticket ${existingTicket.ticketDisplayId} status from API:`, {
        statusName: hfTicket.status.name,
        statusBehavior: hfTicket.status.behavior,
        isClosed: isTicketClosed(hfTicket),
      });

      if (!isTicketClosed(hfTicket)) {
        // Still open — don't create a new one
        console.log(`[HappyFox] Ticket ${existingTicket.ticketDisplayId} is still open (behavior: ${hfTicket.status.behavior}), not creating new ticket`);
        return existingTicket.ticketDisplayId;
      }

      console.log(`[HappyFox] Ticket ${existingTicket.ticketDisplayId} is closed (behavior: ${hfTicket.status.behavior}), will create new ticket`);
    } else {
      console.warn(
        `[HappyFox] Ticket ${existingTicket.ticketId} was not found in HappyFox; ` +
        'marking the local ticket closed.',
      );
    }

    // The ticket is confirmed closed or missing; allow a replacement ticket.
    await prisma.deviceTicket.update({
      where: { id: existingTicket.id },
      data: { status: 'closed' },
    });
  } else {
    console.log(`[HappyFox] No existing open ticket found for device ${deviceName}`);
  }

  // Determine occurrence number
  const totalPriorTickets = await prisma.deviceTicket.count({
    where: { deviceId },
  });
  const occurrenceNum = totalPriorTickets + 1;

  // Build ticket subject/body
  const ordinal = occurrenceNum > 1 ? ` (Occurrence #${occurrenceNum})` : '';
  const subject = `Device Offline: ${deviceName}${ordinal}`;
  const body = occurrenceNum > 1
    ? `Device "${deviceName}" is offline. This is occurrence #${occurrenceNum} for this device.`
    : `Device "${deviceName}" is offline and requires attention.`;

  const hfTicket = await createTicket({
    contactId,
    subject,
    body,
  });

  if (!hfTicket) {
    return null;
  }

  // Store the new ticket
  await prisma.deviceTicket.create({
    data: {
      deviceId,
      ticketId: hfTicket.id,
      ticketDisplayId: hfTicket.display_id,
      status: 'open',
      occurrenceNum,
    },
  });

  console.log(`Created HappyFox ticket ${hfTicket.display_id} for device ${deviceName} (occurrence #${occurrenceNum})`);

  return hfTicket.display_id;
}
