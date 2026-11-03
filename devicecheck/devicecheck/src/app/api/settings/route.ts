import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

const ALLOWED_KEYS = [
  'signageos_api_url',
  'signageos_token_id',
  'signageos_token_secret',
  'email_enabled',
  'ses_region',
  'ses_from_email',
  'ses_access_key_id',
  'ses_secret_access_key',
  'happyfox_url',
  'happyfox_api_key',
  'happyfox_auth_code',
  'happyfox_category_id',
  'reflectview_username',
  'reflectview_password',
  'xyte_api_key',
  'admin_alert_emails',
  'pdu_reboots_disabled',
];

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = await prisma.appSettings.findMany({
    where: { key: { in: ALLOWED_KEYS } },
  });

  const result: Record<string, string> = {};
  for (const s of settings) {
    // Mask secrets
    if (s.key === 'signageos_token_secret' || s.key === 'ses_secret_access_key' || s.key === 'happyfox_auth_code' || s.key === 'reflectview_password' || s.key === 'xyte_api_key') {
      result[s.key] = s.value ? '••••••••' : '';
    } else {
      result[s.key] = s.value;
    }
  }

  return NextResponse.json({ settings: result });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { settings } = body as { settings: Record<string, string> };

  if (!settings || typeof settings !== 'object') {
    return NextResponse.json({ error: 'Settings object required' }, { status: 400 });
  }

  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_KEYS.includes(key)) continue;

    // Skip masked values (user didn't change them)
    if (value === '••••••••') continue;

    await prisma.appSettings.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }

  return NextResponse.json({ success: true });
}
