import { prisma } from './prisma';

export interface RVPlayer {
  uid: string;
  networkName: string;
  name: string;
  locationName: string;
  role: string;
  playerVersion: string;
  connectivity: string; // "Online" or "Offline"
  lastCommunicated: string;
}

interface RVConfig {
  username: string;
  password: string;
}

function buildAuthHeader(creds: RVConfig): string {
  return 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
}

async function getRVCredentials(): Promise<RVConfig> {
  const settings = await prisma.appSettings.findMany({
    where: {
      key: { in: ['reflectview_username', 'reflectview_password'] },
    },
  });

  const config: Record<string, string> = {};
  for (const s of settings) {
    config[s.key] = s.value;
  }

  return {
    username: config['reflectview_username'] || '',
    password: config['reflectview_password'] || '',
  };
}

/**
 * Extract text content from an XML tag, handling xsi:nil="true" self-closing tags.
 */
function getXmlTag(block: string, tag: string): string {
  // Check for self-closing nil tag first: <Tag xsi:nil="true"/>
  const nilRegex = new RegExp(`<${tag}\\s+xsi:nil="true"\\s*/>`);
  if (nilRegex.test(block)) return '';

  const match = block.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
  return match ? match[1] : '';
}

/**
 * Parse the XML response from GetPlayersWithoutLocation.
 * Response format:
 * <ArrayOfPlayer>
 *   <Player>
 *     <UID>guid</UID>
 *     <NetworkName>string</NetworkName>
 *     <Name>string</Name>
 *     <LocationName>string</LocationName>
 *     <Role>string</Role>
 *     <PlayerVersion>string</PlayerVersion>
 *     <Connectivity>Online or Offline</Connectivity>
 *     <LastCommunicated>dateTime</LastCommunicated>
 *   </Player>
 * </ArrayOfPlayer>
 */
function parsePlayersXml(xml: string): RVPlayer[] {
  const players: RVPlayer[] = [];
  const playerRegex = /<Player>([\s\S]*?)<\/Player>/g;
  let match;
  let matchCount = 0;

  console.log(`[RV Parser] Starting XML parsing...`);
  
  while ((match = playerRegex.exec(xml)) !== null) {
    matchCount++;
    const block = match[1];
    const player = {
      uid: getXmlTag(block, 'UID'),
      networkName: getXmlTag(block, 'NetworkName'),
      name: getXmlTag(block, 'Name'),
      locationName: getXmlTag(block, 'LocationName'),
      role: getXmlTag(block, 'Role'),
      playerVersion: getXmlTag(block, 'PlayerVersion'),
      connectivity: getXmlTag(block, 'Connectivity'),
      lastCommunicated: getXmlTag(block, 'LastCommunicated'),
    };
    players.push(player);
    
    if (matchCount <= 3) {
      console.log(`[RV Parser] Player ${matchCount}:`, player);
    }
  }

  console.log(`[RV Parser] Found ${matchCount} <Player> blocks in XML`);
  console.log(`[RV Parser] Successfully parsed ${players.length} players`);

  return players;
}

/**
 * Fetch all players from a ReflectView server using GetPlayersWithoutLocation.
 * Uses basic auth with global RV credentials.
 * Endpoint: GET /rvadministration/PlayerManagement.asmx/GetPlayersWithoutLocation
 */
export async function getPlayers(serverUrl: string): Promise<RVPlayer[]> {
  const creds = await getRVCredentials();

  if (!creds.username || !creds.password) {
    throw new Error('ReflectView credentials not configured in global settings');
  }

  const baseUrl = serverUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/rvadministration/PlayerManagement.asmx/GetPlayers?networkName=&playerUID=&locationName=`;

  console.log(`[RV API] Calling: ${url}`);
  console.log(`[RV API] Using username: ${creds.username}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': buildAuthHeader(creds),
    },
  });

  console.log(`[RV API] Response status: ${response.status} ${response.statusText}`);
  console.log(`[RV API] Response headers:`, Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[RV API] Error response body:`, errorText.substring(0, 500));
    throw new Error(`ReflectView API error: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  console.log(`[RV API] Response length: ${xml.length} characters`);
  console.log(`[RV API] Response preview (first 500 chars):`, xml.substring(0, 500));
  
  const players = parsePlayersXml(xml);
  console.log(`[RV API] Parsed ${players.length} players from XML`);
  
  if (players.length > 0) {
    console.log(`[RV API] First player parsed:`, players[0]);
  }
  
  return players;
}

/**
 * Check the health status of a ReflectView endpoint (player).
 * Endpoint: GET /rvadministration/EndpointManagement.asmx/GetEndpointHealthStatus
 * Params: networkName, endpointUID
 *
 * HealthStatus values: OK, PLAYER_OFFLINE, DISTRIBUTION_OFFLINE, DISPLAY_ERROR,
 *   CHANNEL_ERROR, STORAGE_LOW, FILETRANSMISSION_ERROR (can be comma-separated)
 *
 * We only care about PLAYER_OFFLINE for online/offline determination.
 */
export async function checkRVDeviceStatus(
  serverUrl: string,
  networkName: string,
  endpointUID: string,
): Promise<{ status: string; aliveAt: string | null; healthStatus: string }> {
  const creds = await getRVCredentials();

  if (!creds.username || !creds.password) {
    throw new Error('ReflectView credentials not configured in global settings');
  }

  const baseUrl = serverUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/rvadministration/EndpointManagement.asmx/GetEndpointHealthStatus?networkName=${encodeURIComponent(networkName)}&endpointUID=${encodeURIComponent(endpointUID)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': buildAuthHeader(creds),
    },
  });

  if (!response.ok) {
    throw new Error(`ReflectView API error: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();

  // Parse EndpointHealthStatus
  const statusMatch = xml.match(/<EndpointHealthStatus>([\s\S]*?)<\/EndpointHealthStatus>/);
  if (!statusMatch) {
    return { status: 'UNKNOWN', aliveAt: null, healthStatus: '' };
  }

  const block = statusMatch[1];
  const healthStatus = getXmlTag(block, 'HealthStatus');
  const playerTimestamp = getXmlTag(block, 'PlayerTimestamp');

  const aliveAt = playerTimestamp ? new Date(playerTimestamp).toISOString() : null;

  // If PLAYER_OFFLINE appears in the health status, the device is offline
  const isOffline = healthStatus.includes('PLAYER_OFFLINE');

  return {
    status: isOffline ? 'OFFLINE' : 'ONLINE',
    aliveAt,
    healthStatus,
  };
}
