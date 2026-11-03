import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processReportJob } from './reportJob';
import { processEmailJob } from './emailJob';
import { runScheduler } from './scheduler';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

console.log('Starting DeviceCheck worker...');

// Report generation worker
const reportWorker = new Worker(
  'report-generation',
  async (job) => {
    console.log(`Processing report job: ${job.id}`, job.data);
    await processReportJob(job.data);
  },
  {
    connection,
    concurrency: 2,
  },
);

reportWorker.on('completed', (job) => {
  console.log(`Report job ${job.id} completed`);
});

reportWorker.on('failed', (job, err) => {
  console.error(`Report job ${job?.id} failed:`, err.message);
});

// Email send worker
const emailWorker = new Worker(
  'email-send',
  async (job) => {
    console.log(`Processing email job: ${job.id}`, job.data);
    await processEmailJob(job.data);
  },
  {
    connection,
    concurrency: 5,
  },
);

emailWorker.on('completed', (job) => {
  console.log(`Email job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed:`, err.message);
});

// Start the scheduler for cron-based reports
runScheduler();

console.log('Worker started. Listening for jobs...');

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down worker...');
  await reportWorker.close();
  await emailWorker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
