'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Device {
  id: string;
  name: string;
  signageosDeviceUid: string;
  system: 'SIGNAGEOS' | 'REFLECTVIEW';
  ignored: boolean;
  pduDeviceId: string | null;
  pduPort: number | null;
  lastStatus: string | null;
  lastAliveAt: string | null;
  lastCheckedAt: string | null;
}

interface Recipient {
  id: string;
  email: string;
  enabled: boolean;
}

interface Report {
  id: string;
  runType: string;
  status: string;
  deviceCount: number;
  onlineCount: number;
  offlineCount: number;
  unknownCount: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  filePath: string | null;
}

interface Schedule {
  id: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  time: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  enabled: boolean;
  sendEmail: boolean;
}

interface Customer {
  id: string;
  name: string;
  reportEnabled: boolean;
  reportTimezone: string;
  offlineThresholdSeconds: number;
  ticketThresholdSeconds: number;
  happyfoxContactId: number | null;
  reportOfflineOnly: boolean;
  reflectviewUrl: string | null;
  xytePduEnabled: boolean;
  pduRebootThreshold: number;
  devices: Device[];
  recipients: Recipient[];
  schedules: Schedule[];
  _count: { devices: number; recipients: number; reports: number };
}

type Tab = 'devices' | 'recipients' | 'reports' | 'settings';

function toThresholdDisplay(seconds: number): {
  ticketThresholdUnit: 'seconds' | 'hours' | 'days';
  ticketThresholdDisplay: number;
} {
  if (seconds % 86400 === 0) {
    return { ticketThresholdUnit: 'days', ticketThresholdDisplay: seconds / 86400 };
  }
  if (seconds % 3600 === 0) {
    return { ticketThresholdUnit: 'hours', ticketThresholdDisplay: seconds / 3600 };
  }
  return { ticketThresholdUnit: 'seconds', ticketThresholdDisplay: seconds };
}

function toThresholdSeconds(value: number, unit: 'seconds' | 'hours' | 'days'): number {
  if (unit === 'days') return value * 86400;
  if (unit === 'hours') return value * 3600;
  return value;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('devices');
  const [loading, setLoading] = useState(true);

  // Device form
  const [deviceName, setDeviceName] = useState('');
  const [deviceUid, setDeviceUid] = useState('');
  const [csvImport, setCsvImport] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Device list controls
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceStatusFilter, setDeviceStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'UNKNOWN'>('ALL');
  const [devicePage, setDevicePage] = useState(1);
  const DEVICES_PER_PAGE = 25;

  // Recipient form
  const [recipientEmail, setRecipientEmail] = useState('');

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    reportTimezone: 'America/New_York',
    offlineThresholdSeconds: 180,
    ticketThresholdSeconds: 86400,
    ticketThresholdUnit: 'hours' as 'seconds' | 'hours' | 'days',
    ticketThresholdDisplay: 24,
    happyfoxContactId: '',
    reportOfflineOnly: false,
    reflectviewUrl: '',
    xytePduEnabled: false,
    pduRebootThreshold: 10,
  });

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    frequency: 'DAILY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    time: '08:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    sendEmail: true,
  });

  const [error, setError] = useState('');
  const [reportRunning, setReportRunning] = useState(false);

  const fetchCustomer = useCallback(() => {
    fetch(`/api/customers/${customerId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setCustomer(data.customer);
        setSettingsForm({
          name: data.customer.name,
          reportTimezone: data.customer.reportTimezone,
          offlineThresholdSeconds: data.customer.offlineThresholdSeconds,
          ticketThresholdSeconds: data.customer.ticketThresholdSeconds,
          ...toThresholdDisplay(data.customer.ticketThresholdSeconds),
          happyfoxContactId: data.customer.happyfoxContactId?.toString() || '',
          reportOfflineOnly: data.customer.reportOfflineOnly ?? false,
          reflectviewUrl: data.customer.reflectviewUrl || '',
          xytePduEnabled: data.customer.xytePduEnabled ?? false,
          pduRebootThreshold: data.customer.pduRebootThreshold ?? 10,
        });
        setLoading(false);
      })
      .catch(() => {
        router.replace('/dashboard/customers');
      });
  }, [customerId, router]);

  const fetchReports = useCallback(() => {
    fetch(`/api/customers/${customerId}/reports`)
      .then((res) => res.json())
      .then((data) => setReports(data.reports || []));
  }, [customerId]);

  useEffect(() => {
    fetchCustomer();
    fetchReports();
  }, [fetchCustomer, fetchReports]);

  // Auto-refresh reports
  useEffect(() => {
    if (activeTab !== 'reports') return;
    const interval = setInterval(fetchReports, 5000);
    return () => clearInterval(interval);
  }, [activeTab, fetchReports]);

  const addDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch(`/api/customers/${customerId}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: deviceName, signageosDeviceUid: deviceUid, system: 'SIGNAGEOS' }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    setDeviceName('');
    setDeviceUid('');
    fetchCustomer();
  };

  const [importing, setImporting] = useState(false);

  const importCsv = async () => {
    setError('');
    const lines = csvImport.trim().split('\n').map((l) => l.trim()).filter(Boolean);

    // Skip header row if it looks like one
    const firstLine = lines[0]?.toLowerCase() || '';
    const dataLines = (firstLine.includes('name') && firstLine.includes('uid')) ? lines.slice(1) : lines;

    if (dataLines.length === 0) {
      setError('No device data found. Enter one device per line.');
      return;
    }

    // Parse CSV: Name,UID,System(ignored),PDU Device ID,PDU Port
    const devices = dataLines.map((line) => {
      const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());
      return {
        name: parts[0] || '',
        uid: parts[1] || '',
        pduDeviceId: parts[3] || '',
        pduPort: parts[4] || '',
      };
    });

    // Separate: devices with UIDs go as direct creates/updates, without UIDs need resolution
    const withUid = devices.filter((d) => d.uid);
    const withoutUid = devices.filter((d) => !d.uid && d.name);
    const namesOnly = withoutUid.map((d) => d.name);

    setImporting(true);
    try {
      let importCount = 0;
      const errors: string[] = [];

      // Import devices that need UID resolution (new SOS devices)
      if (namesOnly.length > 0) {
        const res = await fetch(`/api/customers/${customerId}/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: namesOnly, system: 'SIGNAGEOS' }),
        });
        const data = await res.json();
        if (!res.ok) {
          errors.push(data.error || 'Import failed for name-only devices');
        } else {
          importCount += data.count || 0;
          if (data.unresolved?.length > 0) {
            errors.push(`Could not resolve: ${data.unresolved.join(', ')}`);
          }
        }
      }

      // Import/update devices with UIDs (supports PDU fields)
      if (withUid.length > 0) {
        const res = await fetch(`/api/customers/${customerId}/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            devicesWithUid: withUid.map((d) => ({
              name: d.name,
              uid: d.uid,
              pduDeviceId: d.pduDeviceId || null,
              pduPort: d.pduPort ? parseInt(d.pduPort) : null,
            })),
            system: 'SIGNAGEOS',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          errors.push(data.error || 'Import failed for devices with UIDs');
        } else {
          importCount += data.count || 0;
          if (data.updated) {
            importCount += data.updated;
          }
        }
      }

      if (errors.length > 0) {
        setError(`Imported ${importCount} devices. ${errors.join('. ')}`);
      }

      setCsvImport('');
      setShowCsvImport(false);
      fetchCustomer();
    } catch {
      setError('Import failed. Check SignageOS API configuration in Settings.');
    } finally {
      setImporting(false);
    }
  };

  const deleteDevice = async (deviceId: string) => {
    await fetch(`/api/customers/${customerId}/devices?deviceId=${deviceId}`, {
      method: 'DELETE',
    });
    fetchCustomer();
  };

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const syncRVDevices = async () => {
    setError('');
    setSyncMessage('');
    setSyncing(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/devices/sync`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sync failed');
      } else {
        setSyncMessage(
          `Sync complete: ${data.total} players on server, ${data.added} added, ${data.removed} removed, ${data.unchanged} unchanged`
        );
        fetchCustomer();
      }
    } catch {
      setError('Failed to sync with ReflectView server');
    } finally {
      setSyncing(false);
    }
  };

  const toggleIgnore = async (deviceId: string, currentIgnored: boolean) => {
    const res = await fetch(`/api/customers/${customerId}/devices`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ignored: !currentIgnored }),
    });
    if (res.ok) fetchCustomer();
  };

  const [editingPdu, setEditingPdu] = useState<string | null>(null);
  const [pduForm, setPduForm] = useState({ pduDeviceId: '', pduPort: '' });

  const startEditPdu = (device: Device) => {
    setEditingPdu(device.id);
    setPduForm({
      pduDeviceId: device.pduDeviceId || '',
      pduPort: device.pduPort?.toString() || '',
    });
  };

  const savePdu = async (deviceId: string) => {
    const res = await fetch(`/api/customers/${customerId}/devices`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        pduDeviceId: pduForm.pduDeviceId || null,
        pduPort: pduForm.pduPort ? parseInt(pduForm.pduPort) : null,
      }),
    });
    if (res.ok) {
      setEditingPdu(null);
      fetchCustomer();
    }
  };

  const exportDevicesCsv = () => {
    if (!customer) return;
    const header = 'Name,Device UID,System,PDU Device ID,PDU Port';
    const rows = customer.devices.map(
      (d) =>
        `"${d.name}","${d.signageosDeviceUid}","${d.system}","${d.pduDeviceId || ''}","${d.pduPort ?? ''}"`,
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devices_${customer.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [resending, setResending] = useState<string | null>(null);

  const resendEmail = async (reportId: string) => {
    setResending(reportId);
    try {
      const res = await fetch(`/api/customers/${customerId}/reports/${reportId}/resend`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Resend failed');
      }
    } catch {
      setError('Failed to resend email');
    } finally {
      setResending(null);
    }
  };

  const filteredDevices = useMemo(() => {
    if (!customer) return [];
    let devices = customer.devices;

    // Filter by status
    if (deviceStatusFilter !== 'ALL') {
      devices = devices.filter((d) => (d.lastStatus || 'UNKNOWN') === deviceStatusFilter);
    }

    // Search by name or UID
    if (deviceSearch.trim()) {
      const q = deviceSearch.toLowerCase();
      devices = devices.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.signageosDeviceUid.toLowerCase().includes(q),
      );
    }

    return devices;
  }, [customer, deviceStatusFilter, deviceSearch]);

  const totalDevicePages = Math.max(1, Math.ceil(filteredDevices.length / DEVICES_PER_PAGE));
  const paginatedDevices = useMemo(() => {
    const start = (devicePage - 1) * DEVICES_PER_PAGE;
    return filteredDevices.slice(start, start + DEVICES_PER_PAGE);
  }, [filteredDevices, devicePage]);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setDevicePage(1);
  }, [deviceSearch, deviceStatusFilter]);

  const addRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch(`/api/customers/${customerId}/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: recipientEmail }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    setRecipientEmail('');
    fetchCustomer();
  };

  const toggleRecipient = async (recipient: Recipient) => {
    await fetch(`/api/customers/${customerId}/recipients`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recipient.id, enabled: !recipient.enabled }),
    });
    fetchCustomer();
  };

  const deleteRecipient = async (recipientId: string) => {
    await fetch(`/api/customers/${customerId}/recipients?recipientId=${recipientId}`, {
      method: 'DELETE',
    });
    fetchCustomer();
  };

  const runReport = async (sendEmail: boolean) => {
    setReportRunning(true);
    setError('');
    const res = await fetch(`/api/customers/${customerId}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendEmail }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
    }
    setReportRunning(false);
    fetchReports();
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { ticketThresholdUnit, ticketThresholdDisplay, ...rest } = settingsForm;
    const payload = {
      ...rest,
      ticketThresholdSeconds: toThresholdSeconds(ticketThresholdDisplay, ticketThresholdUnit),
    };
    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    fetchCustomer();
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: Record<string, unknown> = {
      frequency: scheduleForm.frequency,
      time: scheduleForm.time,
      sendEmail: scheduleForm.sendEmail,
    };
    if (scheduleForm.frequency === 'WEEKLY') payload.dayOfWeek = scheduleForm.dayOfWeek;
    if (scheduleForm.frequency === 'MONTHLY') payload.dayOfMonth = scheduleForm.dayOfMonth;

    const res = await fetch(`/api/customers/${customerId}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    setShowScheduleForm(false);
    setScheduleForm({ frequency: 'DAILY', time: '08:00', dayOfWeek: 1, dayOfMonth: 1, sendEmail: true });
    fetchCustomer();
  };

  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editForm, setEditForm] = useState({
    frequency: 'DAILY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    time: '08:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    sendEmail: true,
  });

  const startEditSchedule = (s: Schedule) => {
    setEditingSchedule(s);
    setEditForm({
      frequency: s.frequency,
      time: s.time,
      dayOfWeek: s.dayOfWeek ?? 1,
      dayOfMonth: s.dayOfMonth ?? 1,
      sendEmail: s.sendEmail,
    });
  };

  const updateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setError('');
    const payload: Record<string, unknown> = {
      id: editingSchedule.id,
      frequency: editForm.frequency,
      time: editForm.time,
      sendEmail: editForm.sendEmail,
    };
    if (editForm.frequency === 'WEEKLY') payload.dayOfWeek = editForm.dayOfWeek;
    if (editForm.frequency === 'MONTHLY') payload.dayOfMonth = editForm.dayOfMonth;

    const res = await fetch(`/api/customers/${customerId}/schedules`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    setEditingSchedule(null);
    fetchCustomer();
  };

  const toggleSchedule = async (schedule: Schedule) => {
    await fetch(`/api/customers/${customerId}/schedules`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: schedule.id, enabled: !schedule.enabled }),
    });
    fetchCustomer();
  };

  const deleteSchedule = async (scheduleId: string) => {
    await fetch(`/api/customers/${customerId}/schedules?scheduleId=${scheduleId}`, {
      method: 'DELETE',
    });
    fetchCustomer();
  };

  if (loading || !customer) {
    return <div className="text-gray-500">Loading...</div>;
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'devices', label: 'Devices', count: customer._count.devices },
    { key: 'recipients', label: 'Recipients', count: customer._count.recipients },
    { key: 'reports', label: 'Reports', count: customer._count.reports },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/customers')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          &larr; Back to Customers
        </button>
        <h1 className="text-2xl font-bold">{customer.name}</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(''); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Devices Tab */}
      {activeTab === 'devices' && (
        <div>
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Device</h2>
              <div className="flex gap-3">
                {customer?.reflectviewUrl && (
                  <button
                    onClick={syncRVDevices}
                    disabled={syncing}
                    className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50"
                  >
                    {syncing ? 'Syncing...' : '↻ Sync ReflectView'}
                  </button>
                )}
                <button
                  onClick={exportDevicesCsv}
                  className="text-sm text-purple-600 hover:text-purple-800"
                >
                  ↓ Export CSV
                </button>
                <button
                  onClick={() => setShowCsvImport(!showCsvImport)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showCsvImport ? 'Single device' : 'CSV Import'}
                </button>
              </div>
            </div>

            {syncMessage && (
              <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg mb-4">
                {syncMessage}
              </div>
            )}

            <p className="text-xs text-gray-400 mb-2">Manual add is for SignageOS devices only. Use &quot;Sync ReflectView&quot; to import RV devices.</p>

            {showCsvImport ? (
              <div>
                <p className="text-sm text-gray-500 mb-2">
                  Paste device names, one per line. Optionally include UID after a comma (e.g. &quot;Lobby Display,abc123&quot;). Devices without a UID will be resolved from SignageOS.
                </p>
                <textarea
                  value={csvImport}
                  onChange={(e) => setCsvImport(e.target.value)}
                  className="input-field h-32 font-mono text-sm"
                  placeholder="Name,UID,System,PDU Device ID,PDU Port&#10;Lobby Display&#10;Conference Room,uid123&#10;Entrance,uid456,SOS,b6edc5b2-...,3"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: Name,UID,System,PDU Device ID,PDU Port. Only Name is required. Existing devices (matched by UID) will have their PDU fields updated.
                </p>
                <button onClick={importCsv} disabled={importing} className="btn-primary mt-2">
                  {importing ? 'Importing...' : 'Import / Update Devices'}
                </button>
              </div>
            ) : (
              <form onSubmit={addDevice} className="flex gap-4 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="input-field w-full"
                    placeholder="Device name"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    value={deviceUid}
                    onChange={(e) => setDeviceUid(e.target.value)}
                    className="input-field w-full"
                    placeholder="Device UID"
                  />
                </div>
                <button type="submit" className="btn-primary">Add</button>
              </form>
            )}
          </div>

          {customer.devices.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">No devices yet</div>
          ) : (
            <div className="card">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="text"
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  placeholder="Search by name or UID..."
                  className="input-field flex-1"
                />
                <div className="flex gap-1">
                  {(['ALL', 'ONLINE', 'OFFLINE', 'UNKNOWN'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setDeviceStatusFilter(status)}
                      className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                        deviceStatusFilter === status
                          ? status === 'ONLINE'
                            ? 'bg-green-600 text-white'
                            : status === 'OFFLINE'
                              ? 'bg-red-600 text-white'
                              : status === 'UNKNOWN'
                                ? 'bg-yellow-500 text-white'
                                : 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-3">
                Showing {paginatedDevices.length} of {filteredDevices.length} devices
                {filteredDevices.length !== customer.devices.length && ` (${customer.devices.length} total)`}
              </p>

              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">System</th>
                    <th className="pb-3 font-medium">Device UID</th>
                    <th className="pb-3 font-medium">Last Status</th>
                    <th className="pb-3 font-medium">Last Alive</th>
                    {customer.xytePduEnabled && (
                      <th className="pb-3 font-medium">PDU</th>
                    )}
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDevices.length === 0 ? (
                    <tr>
                      <td colSpan={customer.xytePduEnabled ? 7 : 6} className="py-6 text-center text-gray-400">
                        No devices match your search/filter
                      </td>
                    </tr>
                  ) : (
                    paginatedDevices.map((d) => (
                      <tr key={d.id} className={`border-b last:border-0 ${d.ignored ? 'opacity-50' : ''}`}>
                        <td className="py-3 font-medium">
                          {d.name}
                          {d.ignored && (
                            <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                              Ignored
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {d.system === 'REFLECTVIEW' ? 'RV' : 'SOS'}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-xs text-gray-600">{d.signageosDeviceUid}</td>
                        <td className="py-3">
                          {d.lastStatus ? (
                            <span className={`badge-${d.lastStatus.toLowerCase()}`}>
                              {d.lastStatus}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-500">
                          {d.lastAliveAt
                            ? new Date(d.lastAliveAt).toLocaleString()
                            : '-'}
                        </td>
                        {customer.xytePduEnabled && (
                          <td className="py-3">
                            {editingPdu === d.id ? (
                              <div className="flex gap-1 items-center">
                                <input
                                  type="text"
                                  value={pduForm.pduDeviceId}
                                  onChange={(e) => setPduForm({ ...pduForm, pduDeviceId: e.target.value })}
                                  className="input-field w-36 text-xs font-mono"
                                  placeholder="PDU Device ID"
                                />
                                <input
                                  type="number"
                                  value={pduForm.pduPort}
                                  onChange={(e) => setPduForm({ ...pduForm, pduPort: e.target.value })}
                                  className="input-field w-14 text-xs"
                                  placeholder="Port"
                                  min={1}
                                />
                                <button
                                  onClick={() => savePdu(d.id)}
                                  className="text-green-600 hover:text-green-800 text-xs"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingPdu(null)}
                                  className="text-gray-400 hover:text-gray-600 text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditPdu(d)}
                                className="text-xs text-gray-500 hover:text-blue-600"
                              >
                                {d.pduDeviceId
                                  ? `Port ${d.pduPort ?? 3}${!d.pduPort ? ' (default)' : ''} · ${d.pduDeviceId.substring(0, 8)}…`
                                  : '+ Add PDU'}
                              </button>
                            )}
                          </td>
                        )}
                        <td className="py-3 flex gap-3">
                          <button
                            onClick={() => toggleIgnore(d.id, d.ignored)}
                            className="text-yellow-600 hover:text-yellow-800 text-sm"
                          >
                            {d.ignored ? 'Unignore' : 'Ignore'}
                          </button>
                          <button
                            onClick={() => deleteDevice(d.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>

              {totalDevicePages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <button
                    onClick={() => setDevicePage((p) => Math.max(1, p - 1))}
                    disabled={devicePage === 1}
                    className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {devicePage} of {totalDevicePages}
                  </span>
                  <button
                    onClick={() => setDevicePage((p) => Math.min(totalDevicePages, p + 1))}
                    disabled={devicePage === totalDevicePages}
                    className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recipients Tab */}
      {activeTab === 'recipients' && (
        <div>
          <div className="card mb-4">
            <h2 className="text-lg font-semibold mb-4">Add Recipient</h2>
            <form onSubmit={addRecipient} className="flex gap-4">
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="input-field flex-1"
                placeholder="email@example.com"
              />
              <button type="submit" className="btn-primary">Add</button>
            </form>
          </div>

          {customer.recipients.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">No recipients yet</div>
          ) : (
            <div className="card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recipients.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3">{r.email}</td>
                      <td className="py-3">
                        <span
                          className={r.enabled ? 'badge-online' : 'badge-offline'}
                        >
                          {r.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 flex gap-3">
                        <button
                          onClick={() => toggleRecipient(r)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          {r.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => deleteRecipient(r.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => runReport(true)}
              disabled={reportRunning}
              className="btn-primary"
            >
              {reportRunning ? 'Queuing...' : 'Run Report + Email'}
            </button>
            <button
              onClick={() => runReport(false)}
              disabled={reportRunning}
              className="btn-secondary"
            >
              {reportRunning ? 'Queuing...' : 'Run Report Only'}
            </button>
            <button onClick={fetchReports} className="btn-secondary">
              Refresh
            </button>
          </div>

          {reports.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              No reports yet. Click &quot;Run Report Now&quot; to generate one.
            </div>
          ) : (
            <div className="card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Devices</th>
                    <th className="pb-3 font-medium">Online</th>
                    <th className="pb-3 font-medium">Offline</th>
                    <th className="pb-3 font-medium">Unknown</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-3">
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {r.runType}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === 'COMPLETE'
                              ? 'bg-green-100 text-green-800'
                              : r.status === 'FAILED'
                                ? 'bg-red-100 text-red-800'
                                : r.status === 'RUNNING'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3">{r.deviceCount}</td>
                      <td className="py-3 text-green-600">{r.onlineCount}</td>
                      <td className="py-3 text-red-600">{r.offlineCount}</td>
                      <td className="py-3 text-yellow-600">{r.unknownCount}</td>
                      <td className="py-3 flex gap-3">
                        {r.status === 'COMPLETE' && r.filePath && (
                          <>
                            <a
                              href={`/api/customers/${customerId}/reports/${r.id}/download`}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Download CSV
                            </a>
                            <button
                              onClick={() => resendEmail(r.id)}
                              disabled={resending === r.id}
                              className="text-green-600 hover:text-green-800 text-sm disabled:opacity-50"
                            >
                              {resending === r.id ? 'Sending...' : 'Resend Email'}
                            </button>
                          </>
                        )}
                        {r.status === 'FAILED' && r.errorMessage && (
                          <span className="text-red-500 text-xs" title={r.errorMessage}>
                            Error
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Customer Settings</h2>
            <form onSubmit={saveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  className="input-field max-w-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Offline Threshold (seconds)
                </label>
                <input
                  type="number"
                  min={30}
                  value={settingsForm.offlineThresholdSeconds}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      offlineThresholdSeconds: parseInt(e.target.value) || 180,
                    })
                  }
                  className="input-field max-w-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Device is considered offline if last alive exceeds this threshold
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticket Generation Threshold
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    value={settingsForm.ticketThresholdDisplay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setSettingsForm({
                        ...settingsForm,
                        ticketThresholdDisplay: val,
                        ticketThresholdSeconds: toThresholdSeconds(val, settingsForm.ticketThresholdUnit),
                      });
                    }}
                    className="input-field w-24"
                  />
                  <select
                    value={settingsForm.ticketThresholdUnit}
                    onChange={(e) => {
                      const unit = e.target.value as 'seconds' | 'hours' | 'days';
                      setSettingsForm({
                        ...settingsForm,
                        ticketThresholdUnit: unit,
                        ticketThresholdSeconds: toThresholdSeconds(settingsForm.ticketThresholdDisplay, unit),
                      });
                    }}
                    className="input-field w-32"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  A HappyFox ticket is only created after a device has been offline for this long. Default is 24 hours.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Report Timezone
                </label>
                <select
                  value={settingsForm.reportTimezone}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, reportTimezone: e.target.value })
                  }
                  className="input-field max-w-md"
                >
                  <option value="America/New_York">America/New_York (Eastern)</option>
                  <option value="America/Chicago">America/Chicago (Central)</option>
                  <option value="America/Denver">America/Denver (Mountain)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (Pacific)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Scheduled reports will run at the selected time in this timezone
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HappyFox Contact ID
                </label>
                <input
                  type="number"
                  value={settingsForm.happyfoxContactId}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, happyfoxContactId: e.target.value })
                  }
                  className="input-field max-w-xs"
                  placeholder="e.g. 1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The HappyFox contact/user ID to associate tickets with for this customer. Leave blank to disable ticketing.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ReflectView Server URL
                </label>
                <input
                  type="url"
                  value={settingsForm.reflectviewUrl}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, reflectviewUrl: e.target.value })
                  }
                  className="input-field max-w-lg"
                  placeholder="http://rvserver.example.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The ReflectView server URL for this customer. Required if this customer has ReflectView devices.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="xytePduEnabled"
                  checked={settingsForm.xytePduEnabled}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, xytePduEnabled: e.target.checked })
                  }
                />
                <label htmlFor="xytePduEnabled" className="text-sm font-medium text-gray-700">
                  Enable Xyte PDU Management
                </label>
                <p className="text-xs text-gray-500 ml-2">
                  When enabled, offline devices with a PDU assigned will be power-cycled automatically (default port 3, overridable per device)
                </p>
              </div>

              {settingsForm.xytePduEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PDU Reboot Guardrail Threshold
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, Math.floor((customer?.devices?.length || 2) / 2))}
                    value={settingsForm.pduRebootThreshold}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, pduRebootThreshold: parseInt(e.target.value) || 1 })
                    }
                    className="input-field max-w-xs"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If this many or more devices are offline, PDU reboots will be skipped and an admin alert will be sent instead.
                    Max allowed: {Math.max(1, Math.floor((customer?.devices?.length || 2) / 2))} (50% of {customer?.devices?.length || 0} devices). Default: 10.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reportOfflineOnly"
                  checked={settingsForm.reportOfflineOnly}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, reportOfflineOnly: e.target.checked })
                  }
                />
                <label htmlFor="reportOfflineOnly" className="text-sm font-medium text-gray-700">
                  Report Offline Devices Only
                </label>
                <p className="text-xs text-gray-500 ml-2">
                  When enabled, reports will only include offline devices instead of all devices
                </p>
              </div>

              <button type="submit" className="btn-primary">Save Settings</button>
            </form>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Scheduled Reports</h2>
              <button
                onClick={() => setShowScheduleForm(!showScheduleForm)}
                className="btn-primary text-sm"
              >
                {showScheduleForm ? 'Cancel' : 'Add Schedule'}
              </button>
            </div>

            {showScheduleForm && (
              <form onSubmit={addSchedule} className="border rounded-lg p-4 mb-4 bg-gray-50 space-y-3">
                <div className="flex gap-4 flex-wrap">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <select
                      value={scheduleForm.frequency}
                      onChange={(e) =>
                        setScheduleForm({ ...scheduleForm, frequency: e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY' })
                      }
                      className="input-field"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                    <input
                      type="time"
                      value={scheduleForm.time}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  {scheduleForm.frequency === 'WEEKLY' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                      <select
                        value={scheduleForm.dayOfWeek}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(e.target.value) })
                        }
                        className="input-field"
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                    </div>
                  )}

                  {scheduleForm.frequency === 'MONTHLY' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
                      <select
                        value={scheduleForm.dayOfMonth}
                        onChange={(e) =>
                          setScheduleForm({ ...scheduleForm, dayOfMonth: parseInt(e.target.value) })
                        }
                        className="input-field"
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sendEmail"
                    checked={scheduleForm.sendEmail}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, sendEmail: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="sendEmail" className="text-sm font-medium text-gray-700">Send Email</label>
                </div>
                <button type="submit" className="btn-primary text-sm">Add Schedule</button>
              </form>
            )}

            {customer.schedules.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                No scheduled reports. Click &quot;Add Schedule&quot; to create one.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Frequency</th>
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Day</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.schedules.map((s) => {
                    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    let dayDisplay = '-';
                    if (s.frequency === 'WEEKLY' && s.dayOfWeek !== null) dayDisplay = dayLabels[s.dayOfWeek];
                    if (s.frequency === 'MONTHLY' && s.dayOfMonth !== null) dayDisplay = `Day ${s.dayOfMonth}`;

                    if (editingSchedule?.id === s.id) {
                      return (
                        <tr key={s.id} className="border-b last:border-0 bg-blue-50">
                          <td className="py-3" colSpan={6}>
                            <form onSubmit={updateSchedule} className="flex flex-wrap items-end gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                                <select
                                  value={editForm.frequency}
                                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, frequency: e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY' })}
                                  className="input-field text-sm"
                                >
                                  <option value="DAILY">Daily</option>
                                  <option value="WEEKLY">Weekly</option>
                                  <option value="MONTHLY">Monthly</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Time</label>
                                <input
                                  type="time"
                                  value={editForm.time}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, time: e.target.value })}
                                  className="input-field text-sm"
                                />
                              </div>
                              {editForm.frequency === 'WEEKLY' && (
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Day</label>
                                  <select
                                    value={editForm.dayOfWeek}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, dayOfWeek: parseInt(e.target.value) })}
                                    className="input-field text-sm"
                                  >
                                    {dayLabels.map((d, i) => (
                                      <option key={i} value={i}>{d}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {editForm.frequency === 'MONTHLY' && (
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Day</label>
                                  <select
                                    value={editForm.dayOfMonth}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({ ...editForm, dayOfMonth: parseInt(e.target.value) })}
                                    className="input-field text-sm"
                                  >
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={editForm.sendEmail}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, sendEmail: e.target.checked })}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm">Email</span>
                              </div>
                              <button type="submit" className="btn-primary text-sm">Save</button>
                              <button
                                type="button"
                                onClick={() => setEditingSchedule(null)}
                                className="btn-secondary text-sm"
                              >
                                Cancel
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {s.frequency}
                          </span>
                        </td>
                        <td className="py-3">{s.time}</td>
                        <td className="py-3 text-gray-600">{dayDisplay}</td>
                        <td className="py-3">
                          <span className={s.sendEmail ? 'badge-online' : 'badge-offline'}>
                            {s.sendEmail ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={s.enabled ? 'badge-online' : 'badge-offline'}>
                            {s.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-3 flex gap-3">
                          <button
                            onClick={() => startEditSchedule(s)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleSchedule(s)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            {s.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => deleteSchedule(s.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
