'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string;
  reportEnabled: boolean;
  _count: { devices: number; recipients: number; reports: number; schedules: number };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const fetchCustomers = () => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => {
        setCustomers(data.customers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }

    setName('');
    setShowForm(false);
    fetchCustomers();
  };

  const handleDelete = async (id: string, customerName: string) => {
    if (!confirm(`Delete customer "${customerName}" and all associated data?`)) return;

    await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    fetchCustomers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : 'Add Customer'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">New Customer</h2>
          <form onSubmit={handleCreate} className="flex gap-4">
            {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field flex-1"
              placeholder="Customer name"
            />
            <button type="submit" className="btn-primary">Create</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No customers yet. Click &quot;Add Customer&quot; to create one.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {customers.map((c) => (
            <div key={c.id} className="card flex items-center justify-between">
              <div>
                <Link
                  href={`/dashboard/customers/${c.id}`}
                  className="text-lg font-semibold text-blue-600 hover:text-blue-800"
                >
                  {c.name}
                </Link>
                <div className="flex gap-4 mt-1 text-sm text-gray-500">
                  <span>{c._count.devices} devices</span>
                  <span>{c._count.recipients} recipients</span>
                  <span>{c._count.reports} reports</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {c._count.schedules > 0 && (
                  <span className="badge-online">Scheduled</span>
                )}
                <Link
                  href={`/dashboard/customers/${c.id}`}
                  className="btn-secondary text-sm"
                >
                  Manage
                </Link>
                <button
                  onClick={() => handleDelete(c.id, c.name)}
                  className="btn-danger text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
