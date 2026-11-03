'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({
    signageos_api_url: 'https://api.signageos.io',
    signageos_token_id: '',
    signageos_token_secret: '',
    email_enabled: 'false',
    ses_region: 'us-east-1',
    ses_from_email: '',
    ses_access_key_id: '',
    ses_secret_access_key: '',
    happyfox_url: '',
    happyfox_api_key: '',
    happyfox_auth_code: '',
    happyfox_category_id: '',
    reflectview_username: '',
    reflectview_password: '',
    xyte_api_key: '',
    admin_alert_emails: '',
    pdu_reboots_disabled: 'false',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Forbidden');
        return res.json();
      })
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data.settings }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });

    if (res.ok) {
      setMessage('Settings saved successfully');
    } else {
      setMessage('Failed to save settings');
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Global Settings</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm mb-4 ${
          message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* SignageOS Config */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">SignageOS API Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API URL</label>
              <input
                type="url"
                value={settings.signageos_api_url}
                onChange={(e) => setSettings({ ...settings, signageos_api_url: e.target.value })}
                className="input-field max-w-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Token ID</label>
              <input
                type="text"
                value={settings.signageos_token_id}
                onChange={(e) => setSettings({ ...settings, signageos_token_id: e.target.value })}
                className="input-field max-w-lg font-mono"
                placeholder="Your signageOS Token ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Token Secret</label>
              <input
                type="password"
                value={settings.signageos_token_secret}
                onChange={(e) => setSettings({ ...settings, signageos_token_secret: e.target.value })}
                className="input-field max-w-lg font-mono"
                placeholder="Your signageOS Token Secret"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave as dots to keep existing value
              </p>
            </div>
          </div>
        </div>

        {/* Email Config */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Email Configuration (AWS SES)</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.email_enabled === 'true'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      email_enabled: e.target.checked ? 'true' : 'false',
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <span className="text-sm font-medium">Enable email sending</span>
            </div>

            <p className="text-sm text-gray-500">
              When disabled, reports are still generated and stored but no emails are sent.
            </p>

            {settings.email_enabled === 'true' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SES Region</label>
                  <input
                    type="text"
                    value={settings.ses_region}
                    onChange={(e) => setSettings({ ...settings, ses_region: e.target.value })}
                    className="input-field max-w-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Email Address
                  </label>
                  <input
                    type="email"
                    value={settings.ses_from_email}
                    onChange={(e) => setSettings({ ...settings, ses_from_email: e.target.value })}
                    className="input-field max-w-lg"
                    placeholder="noreply@yourdomain.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AWS Access Key ID
                  </label>
                  <input
                    type="text"
                    value={settings.ses_access_key_id}
                    onChange={(e) => setSettings({ ...settings, ses_access_key_id: e.target.value })}
                    className="input-field max-w-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AWS Secret Access Key
                  </label>
                  <input
                    type="password"
                    value={settings.ses_secret_access_key}
                    onChange={(e) =>
                      setSettings({ ...settings, ses_secret_access_key: e.target.value })
                    }
                    className="input-field max-w-lg font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave as dots to keep existing value
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* HappyFox Config */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">HappyFox Ticketing Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HappyFox URL</label>
              <input
                type="url"
                value={settings.happyfox_url}
                onChange={(e) => setSettings({ ...settings, happyfox_url: e.target.value })}
                className="input-field max-w-lg"
                placeholder="https://yourcompany.happyfox.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your HappyFox account URL (e.g. https://yourcompany.happyfox.com)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="text"
                value={settings.happyfox_api_key}
                onChange={(e) => setSettings({ ...settings, happyfox_api_key: e.target.value })}
                className="input-field max-w-lg font-mono"
                placeholder="Your HappyFox API Key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auth Code</label>
              <input
                type="password"
                value={settings.happyfox_auth_code}
                onChange={(e) => setSettings({ ...settings, happyfox_auth_code: e.target.value })}
                className="input-field max-w-lg font-mono"
                placeholder="Your HappyFox Auth Code"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave as dots to keep existing value
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category ID</label>
              <input
                type="number"
                value={settings.happyfox_category_id}
                onChange={(e) => setSettings({ ...settings, happyfox_category_id: e.target.value })}
                className="input-field max-w-xs"
                placeholder="e.g. 1"
              />
              <p className="text-xs text-gray-500 mt-1">
                The HappyFox category ID for new tickets. Find this via the HappyFox API or admin panel.
              </p>
            </div>
          </div>
        </div>

        {/* ReflectView Config */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">ReflectView Configuration</h2>
          <p className="text-sm text-gray-500 mb-4">
            Global credentials used to authenticate with ReflectView servers. Each customer specifies their own RV server URL.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={settings.reflectview_username}
                onChange={(e) => setSettings({ ...settings, reflectview_username: e.target.value })}
                className="input-field max-w-lg"
                placeholder="RV admin username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={settings.reflectview_password}
                onChange={(e) => setSettings({ ...settings, reflectview_password: e.target.value })}
                className="input-field max-w-lg font-mono"
                placeholder="RV admin password"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave as dots to keep existing value
              </p>
            </div>
          </div>
        </div>

        {/* Xyte PDU Config */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Xyte PDU Configuration</h2>
          <p className="text-sm text-gray-500 mb-4">
            Xyte manages PDU (Power Distribution Unit) devices. When configured, the system can automatically power-cycle outlets to recover offline players.
          </p>
          <div className="space-y-4">
            <div className={`flex items-center gap-2 p-3 rounded-lg ${settings.pdu_reboots_disabled === 'true' ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
              <input
                type="checkbox"
                id="pdu_reboots_disabled"
                checked={settings.pdu_reboots_disabled === 'true'}
                onChange={(e) => setSettings({ ...settings, pdu_reboots_disabled: e.target.checked ? 'true' : 'false' })}
              />
              <label htmlFor="pdu_reboots_disabled" className={`text-sm font-medium ${settings.pdu_reboots_disabled === 'true' ? 'text-red-700' : 'text-gray-700'}`}>
                Disable All PDU Reboots (Global Kill Switch)
              </label>
              <p className={`text-xs ml-2 ${settings.pdu_reboots_disabled === 'true' ? 'text-red-500' : 'text-gray-500'}`}>
                {settings.pdu_reboots_disabled === 'true'
                  ? '⚠️ PDU reboots are currently DISABLED for all customers. Reports will still run but no power cycling will occur.'
                  : 'When enabled, all PDU reboots are paused system-wide regardless of per-customer settings.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Core API Key</label>
              <input
                type="password"
                value={settings.xyte_api_key}
                onChange={(e) => setSettings({ ...settings, xyte_api_key: e.target.value })}
                className="input-field max-w-lg font-mono"
                placeholder="Your Xyte Core API Key"
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in Xyte portal under Settings → API Keys. Leave as dots to keep existing value.
              </p>
            </div>
          </div>
        </div>

        {/* Admin Alert Emails */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Admin Alert Emails</h2>
          <p className="text-sm text-gray-500 mb-4">
            These email addresses will receive alerts when safety guardrails are triggered (e.g., too many devices offline, PDU reboots skipped).
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alert Recipients</label>
              <input
                type="text"
                value={settings.admin_alert_emails}
                onChange={(e) => setSettings({ ...settings, admin_alert_emails: e.target.value })}
                className="input-field max-w-lg"
                placeholder="admin@example.com, ops@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated list of email addresses. These contacts will be notified when a PDU reboot guardrail is tripped.
              </p>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </form>
    </div>
  );
}
