import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from './prisma';
import * as fs from 'fs';
import * as path from 'path';

async function getEmailConfig() {
  const settings = await prisma.appSettings.findMany({
    where: {
      key: {
        in: ['email_enabled', 'ses_region', 'ses_from_email', 'ses_access_key_id', 'ses_secret_access_key'],
      },
    },
  });

  const config: Record<string, string> = {};
  for (const s of settings) {
    config[s.key] = s.value;
  }

  return {
    enabled: (config['email_enabled'] || process.env.EMAIL_ENABLED) === 'true',
    region: config['ses_region'] || process.env.AWS_REGION || 'us-east-1',
    fromEmail: config['ses_from_email'] || process.env.SES_FROM_EMAIL || 'noreply@example.com',
    accessKeyId: config['ses_access_key_id'] || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: config['ses_secret_access_key'] || process.env.AWS_SECRET_ACCESS_KEY || '',
  };
}

export async function isEmailEnabled(): Promise<boolean> {
  const config = await getEmailConfig();
  return config.enabled;
}

export async function getAdminAlertEmails(): Promise<string[]> {
  const setting = await prisma.appSettings.findUnique({
    where: { key: 'admin_alert_emails' },
  });
  if (!setting?.value) return [];
  return setting.value.split(',').map((e: string) => e.trim()).filter(Boolean);
}

export async function sendAdminAlert(
  subject: string,
  htmlBody: string,
) {
  const config = await getEmailConfig();

  if (!config.enabled) {
    console.log('[AdminAlert] Email is disabled, skipping alert');
    return;
  }

  const recipients = await getAdminAlertEmails();
  if (recipients.length === 0) {
    console.log('[AdminAlert] No admin alert emails configured, skipping');
    return;
  }

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error('[AdminAlert] AWS SES credentials not configured');
    return;
  }

  console.log(`[AdminAlert] Sending alert to ${recipients.join(', ')}: ${subject}`);

  const ses = new SESClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const boundary = `boundary_${Date.now()}`;

  const rawMessage = [
    `From: ${config.fromEmail}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  try {
    const result = await ses.send(
      new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawMessage) },
      }),
    );
    console.log('[AdminAlert] SES send success:', result.MessageId);
  } catch (err) {
    console.error('[AdminAlert] SES send FAILED:', err);
  }
}

export async function sendReportEmail(
  recipients: string[],
  subject: string,
  htmlBody: string,
  csvFilePath: string,
) {
  const config = await getEmailConfig();

  if (!config.enabled) {
    console.log('Email is disabled, skipping send');
    return;
  }

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('AWS SES credentials not configured');
  }

  console.log('[Email] Preparing to send email:', {
    region: config.region,
    fromEmail: config.fromEmail,
    recipients,
    subject,
    hasAccessKey: !!config.accessKeyId,
    accessKeyPrefix: config.accessKeyId.substring(0, 6) + '...',
  });

  const ses = new SESClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const csvContent = fs.readFileSync(csvFilePath);
  const csvBase64 = csvContent.toString('base64');
  const filename = path.basename(csvFilePath);

  const boundary = `boundary_${Date.now()}`;

  const rawMessage = [
    `From: ${config.fromEmail}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}`,
    `Content-Type: text/csv; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    csvBase64,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  try {
    const result = await ses.send(
      new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawMessage) },
      }),
    );
    console.log('[Email] SES send success:', {
      messageId: result.MessageId,
      requestId: result.$metadata?.requestId,
      httpStatusCode: result.$metadata?.httpStatusCode,
    });
  } catch (err: unknown) {
    const error = err as Error & { $metadata?: { httpStatusCode?: number; requestId?: string }; Code?: string };
    console.error('[Email] SES send FAILED:', {
      message: error.message,
      code: error.Code,
      httpStatusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      name: error.name,
    });
    throw err;
  }
}
