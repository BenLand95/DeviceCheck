import { prisma } from './prisma';

interface DeviceAliveResponse {
  deviceUid: string;
  aliveAt: string;
}

async function getSignageOSConfig() {
  const settings = await prisma.appSettings.findMany({
    where: {
      key: {
        in: ['signageos_api_url', 'signageos_token_id', 'signageos_token_secret'],
      },
    },
  });

  const config: Record<string, string> = {};
  for (const s of settings) {
    config[s.key] = s.value;
  }

  return {
    apiUrl: config['signageos_api_url'] || process.env.SIGNAGEOS_API_URL || 'https://api.signageos.io',
    tokenId: config['signageos_token_id'] || process.env.SIGNAGEOS_TOKEN_ID || '',
    tokenSecret: config['signageos_token_secret'] || process.env.SIGNAGEOS_TOKEN_SECRET || '',
  };
}

export async function getDeviceAlive(
  deviceUid: string,
): Promise<{ status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'; aliveAt: string | null; error?: string }> {
  try {
    const config = await getSignageOSConfig();

    if (!config.tokenId || !config.tokenSecret) {
      return { status: 'UNKNOWN', aliveAt: null, error: 'SignageOS API not configured' };
    }

    const response = await fetch(
      `${config.apiUrl}/v1/device/${encodeURIComponent(deviceUid)}/alive`,
      {
        headers: {
          'X-Auth': `${config.tokenId}:${config.tokenSecret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return { status: 'UNKNOWN', aliveAt: null, error: `API error ${response.status}: ${text}` };
    }

    const data: DeviceAliveResponse = await response.json();
    return {
      status: 'ONLINE',
      aliveAt: data.aliveAt,
    };
  } catch (error) {
    return {
      status: 'UNKNOWN',
      aliveAt: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface SignageOSDevice {
  uid: string;
  duid?: string;
  name?: string;
}

// Fetch all devices from SignageOS with pagination, rate-limited to ~10 req/s max
export async function fetchAllDevices(): Promise<SignageOSDevice[]> {
  const config = await getSignageOSConfig();

  if (!config.tokenId || !config.tokenSecret) {
    throw new Error('SignageOS API not configured');
  }

  const allDevices: SignageOSDevice[] = [];
  let url: string | null = `${config.apiUrl}/v1/device?limit=100`;
  let requestCount = 0;
  const MAX_REQUESTS = 20; // safety cap: 20 pages × 100 = 2000 devices max

  while (url && requestCount < MAX_REQUESTS) {
    // Rate limit: wait 100ms between requests (~10 req/s, well under 200/s limit)
    if (requestCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const response: Response = await fetch(url as string, {
      headers: {
        'X-Auth': `${config.tokenId}:${config.tokenSecret}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SignageOS API error ${response.status}: ${text}`);
    }

    const devices: SignageOSDevice[] = await response.json();
    allDevices.push(...devices);
    requestCount++;

    // Check for next page via Link header
    const linkHeader = response.headers.get('Link');
    url = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        url = match[1];
      }
    }
  }

  return allDevices;
}

// Build a case-insensitive name → UID map from all SignageOS devices
export async function resolveDeviceNameToUid(
  names: string[],
): Promise<{ resolved: { name: string; uid: string }[]; unresolved: string[] }> {
  const allDevices = await fetchAllDevices();

  // Build lookup: lowercase name → device
  const nameMap = new Map<string, SignageOSDevice>();
  for (const device of allDevices) {
    if (device.name) {
      nameMap.set(device.name.toLowerCase().trim(), device);
    }
  }

  const resolved: { name: string; uid: string }[] = [];
  const unresolved: string[] = [];

  for (const name of names) {
    const device = nameMap.get(name.toLowerCase().trim());
    if (device) {
      resolved.push({ name: name.trim(), uid: device.uid });
    } else {
      unresolved.push(name.trim());
    }
  }

  return { resolved, unresolved };
}

export async function checkDeviceStatus(
  deviceUid: string,
  offlineThresholdSeconds: number,
): Promise<{ status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'; aliveAt: string | null; error?: string }> {
  const result = await getDeviceAlive(deviceUid);

  if (result.status === 'UNKNOWN') {
    return result;
  }

  if (result.aliveAt) {
    const aliveTime = new Date(result.aliveAt).getTime();
    const now = Date.now();
    const diffSeconds = (now - aliveTime) / 1000;

    if (diffSeconds > offlineThresholdSeconds) {
      return { status: 'OFFLINE', aliveAt: result.aliveAt };
    }
    return { status: 'ONLINE', aliveAt: result.aliveAt };
  }

  return { status: 'UNKNOWN', aliveAt: null, error: 'No aliveAt timestamp' };
}
