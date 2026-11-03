import { PrismaClient } from '@prisma/client';
import { enqueueReport } from '../lib/queue';

const prisma = new PrismaClient();

/**
 * Get the current time components in a given IANA timezone.
 * Returns { hour, minute, dayOfWeek (0=Sun), dayOfMonth }.
 */
function getNowInTimezone(timezone: string) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    day: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const dayOfMonth = parseInt(get('day'), 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = weekdayMap[get('weekday')] ?? -1;

  return { hour, minute, dayOfWeek, dayOfMonth };
}

/**
 * Check all enabled schedules and enqueue reports for any that match
 * the current minute in the customer's timezone.
 */
async function checkSchedules() {
  try {
    const schedules = await prisma.reportSchedule.findMany({
      where: { enabled: true },
      include: { customer: true },
    });

    for (const schedule of schedules) {
      const timezone = schedule.customer.reportTimezone || 'America/New_York';
      const now = getNowInTimezone(timezone);

      // Parse schedule time (HH:MM)
      const [schedHour, schedMinute] = schedule.time.split(':').map(Number);

      // Must match hour and minute
      if (now.hour !== schedHour || now.minute !== schedMinute) continue;

      // Check frequency-specific day match
      if (schedule.frequency === 'WEEKLY' && schedule.dayOfWeek !== null) {
        if (now.dayOfWeek !== schedule.dayOfWeek) continue;
      }
      if (schedule.frequency === 'MONTHLY' && schedule.dayOfMonth !== null) {
        if (now.dayOfMonth !== schedule.dayOfMonth) continue;
      }

      // This schedule should fire — check for duplicate prevention
      try {
        const recentReport = await prisma.report.findFirst({
          where: {
            scheduleId: schedule.id,
            runType: 'SCHEDULED',
            createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
          },
        });

        if (recentReport) {
          console.log(`Skipping duplicate scheduled report for ${schedule.customer.name} (schedule ${schedule.id})`);
          continue;
        }

        const deviceCount = await prisma.device.count({
          where: { customerId: schedule.customerId },
        });

        if (deviceCount === 0) {
          console.log(`No devices for ${schedule.customer.name}, skipping`);
          continue;
        }

        const report = await prisma.report.create({
          data: {
            customerId: schedule.customerId,
            scheduleId: schedule.id,
            runType: 'SCHEDULED',
            status: 'QUEUED',
          },
        });

        await enqueueReport(schedule.customerId, report.id, 'SCHEDULED');
        console.log(
          `Enqueued scheduled report ${report.id} for ${schedule.customer.name} ` +
          `(${schedule.frequency} at ${schedule.time} ${timezone})`
        );
      } catch (error) {
        console.error(`Failed to enqueue report for schedule ${schedule.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error checking schedules:', error);
  }
}

export function runScheduler() {
  console.log('Starting scheduler...');

  // Check every 60 seconds
  checkSchedules();
  setInterval(checkSchedules, 60_000);
}
