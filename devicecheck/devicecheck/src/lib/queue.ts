import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let _connection: IORedis | null = null;

function getConnection() {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

let _reportQueue: Queue | null = null;
let _emailQueue: Queue | null = null;

function getReportQueue() {
  if (!_reportQueue) {
    _reportQueue = new Queue('report-generation', { connection: getConnection() });
  }
  return _reportQueue;
}

function getEmailQueue() {
  if (!_emailQueue) {
    _emailQueue = new Queue('email-send', { connection: getConnection() });
  }
  return _emailQueue;
}

export async function enqueueReport(customerId: string, reportId: string, runType: 'MANUAL' | 'SCHEDULED', sendEmail?: boolean) {
  await getReportQueue().add('generate-report', { customerId, reportId, runType, sendEmail }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function enqueueEmail(reportId: string) {
  await getEmailQueue().add('send-report-email', { reportId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
