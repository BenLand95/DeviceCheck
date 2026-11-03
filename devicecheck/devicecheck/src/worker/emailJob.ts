import { PrismaClient } from '@prisma/client';
import { sendReportEmail } from '../lib/email';

const prisma = new PrismaClient();

interface EmailJobData {
  reportId: string;
}

export async function processEmailJob(data: EmailJobData) {
  const { reportId } = data;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      customer: {
        include: {
          recipients: {
            where: { enabled: true },
          },
        },
      },
    },
  });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.status !== 'COMPLETE' || !report.filePath) {
    throw new Error('Report not ready for sending');
  }

  const recipients = report.customer.recipients.map((r) => r.email);

  if (recipients.length === 0) {
    console.log('No enabled recipients, skipping email');
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const subject = `Device Status Report - ${report.customer.name} - ${date}`;

  const htmlBody = `
    <h2>Device Status Report</h2>
    <p><strong>Customer:</strong> ${report.customer.name}</p>
    <p><strong>Date:</strong> ${date}</p>
    <hr>
    <table style="border-collapse: collapse; width: 100%; max-width: 400px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Devices</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${report.deviceCount}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; color: green;"><strong>Online</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${report.onlineCount}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; color: red;"><strong>Offline</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${report.offlineCount}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; color: orange;"><strong>Unknown</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${report.unknownCount}</td>
      </tr>
    </table>
    <br>
    <p>The full CSV report is attached to this email.</p>
  `;

  try {
    await sendReportEmail(recipients, subject, htmlBody, report.filePath);
    console.log(`Email sent to ${recipients.length} recipients for report ${reportId}`);
  } catch (err) {
    console.error(`[Email] Failed to send email for report ${reportId}:`, err);
    throw err;
  }
}
