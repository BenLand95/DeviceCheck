import { prisma } from './prisma';

const XYTE_BASE_URL = 'https://hub.xyte.io/core/v1';

async function getXyteApiKey(): Promise<string> {
  const setting = await prisma.appSettings.findUnique({
    where: { key: 'xyte_api_key' },
  });

  if (!setting?.value) {
    throw new Error('Xyte API key not configured');
  }

  return setting.value;
}

interface XyteDevice {
  id: string;
  name: string;
  status: string;
  model: string;
  firmware_version?: string;
  space?: { id: string; name: string };
  [key: string]: unknown;
}

interface XyteCommand {
  id: string;
  status: string;
  name: string;
  friendly_name: string;
  params: Record<string, unknown>;
  message: string | null;
  device_id: string;
  created_at: string;
  scheduled_at: string;
  issuer_name: string;
}

interface XyteCommandsResponse {
  items: XyteCommand[];
  has_next_page: boolean;
}

interface XyteDevicesResponse {
  items: XyteDevice[];
  has_next_page: boolean;
}

/**
 * Get a single Xyte device by ID (PDU).
 * Returns device info including online/offline status.
 */
export async function getXyteDevice(deviceId: string): Promise<XyteDevice> {
  const apiKey = await getXyteApiKey();

  const response = await fetch(
    `${XYTE_BASE_URL}/organization/devices/${encodeURIComponent(deviceId)}`,
    {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xyte API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * List all Xyte devices in the organization.
 */
export async function listXyteDevices(): Promise<XyteDevice[]> {
  const apiKey = await getXyteApiKey();
  const allDevices: XyteDevice[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const response = await fetch(
      `${XYTE_BASE_URL}/organization/devices?page=${page}`,
      {
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Xyte API error ${response.status}: ${text}`);
    }

    const data: XyteDevicesResponse = await response.json();
    allDevices.push(...data.items);
    hasNext = data.has_next_page;
    page++;
  }

  return allDevices;
}

/**
 * Get available commands for a Xyte device (PDU outlets).
 */
export async function getXyteDeviceCommands(deviceId: string): Promise<XyteCommand[]> {
  const apiKey = await getXyteApiKey();

  const response = await fetch(
    `${XYTE_BASE_URL}/organization/devices/${encodeURIComponent(deviceId)}/commands`,
    {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xyte API error ${response.status}: ${text}`);
  }

  const data: XyteCommandsResponse = await response.json();
  return data.items;
}

/**
 * Send a power command to a specific outlet on a PDU.
 * @param deviceId - Xyte PDU device UUID
 * @param port - Port number (1-based), will be zero-padded to 2 digits for the command name
 * @param command - "Off", "On", or "Cycle"
 */
export async function sendPowerCommand(
  deviceId: string,
  port: number,
  command: 'Off' | 'On' | 'Cycle',
): Promise<{ id: string; status: string }> {
  const apiKey = await getXyteApiKey();
  const portName = port.toString().padStart(2, '0'); // "01", "02", etc.
  const friendlyName = `Outlet ${port}`;

  const response = await fetch(
    `${XYTE_BASE_URL}/organization/devices/${encodeURIComponent(deviceId)}/commands`,
    {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: portName,
        friendly_name: friendlyName,
        extra_params: { powerCommand: command },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xyte command error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Power cycle a PDU port: sends a single "Cycle" command which turns off then back on.
 * @param deviceId - Xyte PDU device UUID
 * @param port - Port number (1-based)
 */
export async function powerCyclePort(
  deviceId: string,
  port: number,
): Promise<{ commandId: string }> {
  console.log(`[Xyte] Power cycling PDU ${deviceId} port ${port}...`);

  const result = await sendPowerCommand(deviceId, port, 'Cycle');
  console.log(`[Xyte] Port ${port} CYCLE command sent: ${result.id}`);

  return { commandId: result.id };
}

/**
 * Check if a PDU device is online.
 * Returns true if the device status indicates it's connected/online.
 */
export async function isPduOnline(deviceId: string): Promise<boolean> {
  try {
    const device = await getXyteDevice(deviceId);
    // Xyte typically uses "online" or "active" status
    const status = (device.status || '').toLowerCase();
    return status === 'online' || status === 'active';
  } catch (err) {
    console.error(`[Xyte] Failed to check PDU ${deviceId} status:`, err);
    return false;
  }
}
