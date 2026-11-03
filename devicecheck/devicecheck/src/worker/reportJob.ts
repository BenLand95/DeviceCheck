import { PrismaClient } from '@prisma/client';
import { checkDeviceStatus } from '../lib/signageos';
import { checkRVDeviceStatus } from '../lib/reflectview';
import { handleOfflineDevice } from '../lib/happyfox';
import { enqueueEmail } from '../lib/queue';
import { isEmailEnabled, sendAdminAlert } from '../lib/email';
import { isPduOnline, powerCyclePort } from '../lib/xyte';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const CONCURRENCY_LIMIT = 15;
const REQUEST_DELAY_MS = 30;

interface ReportJobData {
  customerId: string;
  reportId: string;
  runType: 'MANUAL' | 'SCHEDULED';
  sendEmail?: boolean;
}

const PDU_DEFAULT_PORT = 3;
const PDU_RECHECK_DELAY_MS = 180_000; // 3 minutes

interface DeviceResult {
  deviceName: string;
  deviceUid: string;
  status: string;
  aliveAt: string | null;
  ticketId: string | null;
  error?: string;
  pduAction?: string; // 'rebooted' | 'pdu_offline' | 'recovered' | null
  pduPort?: number;
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
) {
  const results: unknown[] = [];
  let index = 0;

  async function next(): Promise<void> {
    const currentIndex = index++;
    if (currentIndex >= items.length) return;
    results[currentIndex] = await fn(items[currentIndex]);
    if (currentIndex + limit < items.length) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
    await next();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

export async function processReportJob(data: ReportJobData) {
  const { customerId, reportId } = data;

  // Mark report as running
  await prisma.report.update({
    where: { id: reportId },
    data: { status: 'RUNNING' },
  });

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { devices: true },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const devices = customer.devices.filter((d) => !d.ignored);
    const results: DeviceResult[] = [];

    // Check device status with bounded concurrency
    await runWithConcurrencyLimit(devices, CONCURRENCY_LIMIT, async (device) => {
      let result: { status: string; aliveAt: string | null; error?: string };

      if (device.system === 'REFLECTVIEW') {
        if (!customer.reflectviewUrl) {
          result = { status: 'UNKNOWN', aliveAt: null, error: 'No ReflectView server URL configured for this customer' };
        } else if (!device.networkName) {
          result = { status: 'UNKNOWN', aliveAt: null, error: 'No networkName stored for this device. Re-sync from ReflectView.' };
        } else {
          try {
            const rvResult = await checkRVDeviceStatus(
              customer.reflectviewUrl,
              device.networkName,
              device.signageosDeviceUid,
            );
            result = { status: rvResult.status, aliveAt: rvResult.aliveAt };
          } catch (err) {
            result = { status: 'UNKNOWN', aliveAt: null, error: err instanceof Error ? err.message : 'RV check failed' };
          }
        }
      } else {
        result = await checkDeviceStatus(
          device.signageosDeviceUid,
          customer.offlineThresholdSeconds,
        );
      }

      results.push({
        deviceName: device.name,
        deviceUid: device.signageosDeviceUid,
        status: result.status,
        aliveAt: result.aliveAt,
        ticketId: null,
        error: result.error,
      });

      // Update device record
      await prisma.device.update({
        where: { id: device.id },
        data: {
          lastStatus: result.status,
          lastAliveAt: result.aliveAt ? new Date(result.aliveAt) : null,
          lastCheckedAt: new Date(),
        },
      });
    });

    // PDU power-cycle logic for offline devices
    let guardrailTripped = false;
    const globalPduDisabled = await prisma.appSettings.findUnique({ where: { key: 'pdu_reboots_disabled' } });
    const pduGloballyDisabled = globalPduDisabled?.value === 'true';

    if (pduGloballyDisabled && customer.xytePduEnabled) {
      console.log(`[PDU] Global kill switch is ON — skipping all PDU reboots for ${customer.name}`);
    }

    if (customer.xytePduEnabled && !pduGloballyDisabled) {
      const offlineCount = results.filter((r) => r.status === 'OFFLINE').length;
      const threshold = customer.pduRebootThreshold ?? 10;

      const offlineWithPdu = results.filter(
        (r) => r.status === 'OFFLINE' && devices.find(
          (d) => d.signageosDeviceUid === r.deviceUid && d.pduDeviceId,
        ),
      );

      // Guardrail: if too many devices are offline, skip all PDU reboots
      if (offlineCount >= threshold) {
        guardrailTripped = true;
        console.log(`[PDU GUARDRAIL] ${offlineCount} offline devices >= threshold ${threshold} for customer ${customer.name}. Skipping ALL PDU reboots.`);

        // Mark all PDU devices as guardrail-skipped
        for (const r of offlineWithPdu) {
          const device = devices.find((d) => d.signageosDeviceUid === r.deviceUid)!;
          r.pduPort = device.pduPort ?? PDU_DEFAULT_PORT;
          r.pduAction = 'guardrail_skipped';
        }

        // Send admin alert
        try {
          const totalDevices = devices.length;
          await sendAdminAlert(
            `⚠️ PDU Guardrail Tripped: ${customer.name}`,
            `<h2>PDU Reboot Guardrail Triggered</h2>
            <p><strong>Customer:</strong> ${customer.name}</p>
            <p><strong>Total Devices:</strong> ${totalDevices}</p>
            <p><strong>Offline Devices:</strong> ${offlineCount}</p>
            <p><strong>Guardrail Threshold:</strong> ${threshold}</p>
            <p><strong>PDU-Equipped Offline Devices:</strong> ${offlineWithPdu.length}</p>
            <hr/>
            <p>Because ${offlineCount} devices are offline (at or above the threshold of ${threshold}), <strong>all PDU reboots have been skipped</strong> for this report run.</p>
            <p>This may indicate a server-side or network issue rather than individual device failures. Please investigate before manually triggering reboots.</p>
            <h3>Offline Devices:</h3>
            <ul>${results.filter((r) => r.status === 'OFFLINE').map((r) => `<li>${r.deviceName} (${r.deviceUid})</li>`).join('')}</ul>`,
          );
        } catch (err) {
          console.error('[PDU GUARDRAIL] Failed to send admin alert:', err);
        }
      } else if (offlineWithPdu.length > 0) {
        console.log(`[PDU] ${offlineWithPdu.length} offline device(s) with PDU config, attempting recovery... (${offlineCount} offline < threshold ${threshold})`);

        for (const r of offlineWithPdu) {
          const device = devices.find((d) => d.signageosDeviceUid === r.deviceUid)!;
          const port = device.pduPort ?? PDU_DEFAULT_PORT;
          r.pduPort = port;

          try {
            const pduOnline = await isPduOnline(device.pduDeviceId!);

            if (!pduOnline) {
              console.log(`[PDU] PDU ${device.pduDeviceId} is OFFLINE for device ${r.deviceName}`);
              r.pduAction = 'pdu_offline';
              continue;
            }

            // Power cycle the port
            console.log(`[PDU] Power cycling PDU ${device.pduDeviceId} port ${port} for ${r.deviceName}`);
            await powerCyclePort(device.pduDeviceId!, port);
            r.pduAction = 'rebooted';
          } catch (err) {
            console.error(`[PDU] Power cycle failed for ${r.deviceName}:`, err);
            r.pduAction = 'rebooted';
            r.error = (r.error ? r.error + '; ' : '') + `PDU reboot error: ${err instanceof Error ? err.message : 'unknown'}`;
          }
        }

        // Wait for devices to come back online after power cycle
        const rebootedDevices = offlineWithPdu.filter((r) => r.pduAction === 'rebooted');
        if (rebootedDevices.length > 0) {
          console.log(`[PDU] Waiting ${PDU_RECHECK_DELAY_MS / 1000}s for ${rebootedDevices.length} device(s) to recover...`);
          await new Promise((resolve) => setTimeout(resolve, PDU_RECHECK_DELAY_MS));

          // Recheck each rebooted device
          for (const r of rebootedDevices) {
            const device = devices.find((d) => d.signageosDeviceUid === r.deviceUid)!;
            let recheckResult: { status: string; aliveAt: string | null };

            try {
              if (device.system === 'REFLECTVIEW') {
                if (customer.reflectviewUrl && device.networkName) {
                  recheckResult = await checkRVDeviceStatus(
                    customer.reflectviewUrl,
                    device.networkName,
                    device.signageosDeviceUid,
                  );
                } else {
                  recheckResult = { status: 'OFFLINE', aliveAt: r.aliveAt };
                }
              } else {
                recheckResult = await checkDeviceStatus(
                  device.signageosDeviceUid,
                  customer.offlineThresholdSeconds,
                );
              }

              if (recheckResult.status === 'ONLINE') {
                console.log(`[PDU] Device ${r.deviceName} recovered after power cycle!`);
                r.status = 'ONLINE';
                r.aliveAt = recheckResult.aliveAt;
                r.pduAction = 'recovered';

                await prisma.device.update({
                  where: { id: device.id },
                  data: {
                    lastStatus: 'ONLINE',
                    lastAliveAt: recheckResult.aliveAt ? new Date(recheckResult.aliveAt) : null,
                    lastCheckedAt: new Date(),
                  },
                });
              } else {
                console.log(`[PDU] Device ${r.deviceName} still offline after power cycle`);
              }
            } catch (err) {
              console.error(`[PDU] Recheck failed for ${r.deviceName}:`, err);
            }
          }
        }
      }
    }

    // Handle HappyFox tickets for offline devices
    if (customer.happyfoxContactId) {
      const ticketThreshold = customer.ticketThresholdSeconds ?? 86400;

      for (const r of results) {
        if (r.status === 'OFFLINE') {
          // Check if device has been offline long enough to warrant a ticket
          let offlineDurationSeconds = 0;
          if (r.aliveAt) {
            offlineDurationSeconds = (Date.now() - new Date(r.aliveAt).getTime()) / 1000;
          }

          if (offlineDurationSeconds < ticketThreshold) {
            console.log(
              `Skipping ticket for ${r.deviceName}: offline ${Math.round(offlineDurationSeconds)}s < threshold ${ticketThreshold}s`,
            );
            continue;
          }

          try {
            const ticketDisplayId = await handleOfflineDevice(
              devices.find((d) => d.signageosDeviceUid === r.deviceUid)!.id,
              r.deviceName,
              customer.happyfoxContactId,
            );
            r.ticketId = ticketDisplayId;
          } catch (err) {
            console.error(`Ticket handling failed for ${r.deviceName}:`, err);
          }
        }
      }
    }

    // Filter results if reportOfflineOnly is enabled
    const reportResults = customer.reportOfflineOnly
      ? results.filter((r) => r.status === 'OFFLINE')
      : results;

    // Generate CSV
    const csvLines = [
      'Device Name,Status,Last Alive At,Ticket ID,PDU Action,PDU Port,Error',
    ];

    if (guardrailTripped) {
      csvLines.push(`"⚠️ PDU GUARDRAIL TRIPPED - All PDU reboots were skipped for this report run",,,,,,"Too many devices offline (threshold: ${customer.pduRebootThreshold ?? 10})"`);
    }

    for (const r of reportResults) {
      csvLines.push(
        [
          `"${r.deviceName.replace(/"/g, '""')}"`,
          r.status,
          r.aliveAt || '',
          r.ticketId || '',
          r.pduAction || '',
          r.pduPort ?? '',
          `"${(r.error || '').replace(/"/g, '""')}"`,
        ].join(','),
      );
    }

    const csvContent = csvLines.join('\n');

    // Save CSV
    const reportsDir = process.env.REPORT_LOCAL_PATH || '/app/reports';
    fs.mkdirSync(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `report_${customer.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`;
    const filePath = path.join(reportsDir, filename);

    fs.writeFileSync(filePath, csvContent);

    // Count results
    const onlineCount = results.filter((r) => r.status === 'ONLINE').length;
    const offlineCount = results.filter((r) => r.status === 'OFFLINE').length;
    const unknownCount = results.filter((r) => r.status === 'UNKNOWN').length;

    // Update report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'COMPLETE',
        filePath,
        deviceCount: devices.length,
        onlineCount,
        offlineCount,
        unknownCount,
        completedAt: new Date(),
      },
    });

    console.log(
      `Report ${reportId} complete: ${onlineCount} online, ${offlineCount} offline, ${unknownCount} unknown`,
    );

    // Enqueue email if enabled
    const emailEnabled = await isEmailEnabled();
    if (emailEnabled) {
      let shouldSendEmail = true;

      if (data.runType === 'MANUAL') {
        // For manual reports, use the sendEmail flag from the job data (defaults to true)
        if (data.sendEmail === false) {
          shouldSendEmail = false;
        }
      } else if (data.runType === 'SCHEDULED') {
        // For scheduled reports, check if the schedule has sendEmail enabled
        const report = await prisma.report.findUnique({
          where: { id: reportId },
          include: { schedule: true },
        });
        if (report?.schedule && !report.schedule.sendEmail) {
          shouldSendEmail = false;
        }
      }

      if (shouldSendEmail) {
        await enqueueEmail(reportId);
      }
    }
  } catch (error) {
    console.error(`Report ${reportId} failed:`, error);
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });
  }
}
