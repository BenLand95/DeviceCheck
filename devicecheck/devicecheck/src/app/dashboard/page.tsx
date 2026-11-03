'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string;
  _count: { devices: number; recipients: number; reports: number };
}

export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => {
        setCustomers(data.customers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <div className="text-3xl font-bold text-blue-600">{customers.length}</div>
          <div className="text-sm text-gray-500 mt-1">Customers</div>
        </div>
        <div className="card">
          <div className="text-3xl font-bold text-green-600">
            {customers.reduce((sum, c) => sum + c._count.devices, 0)}
          </div>
          <div className="text-sm text-gray-500 mt-1">Total Devices</div>
        </div>
        <div className="card">
          <div className="text-3xl font-bold text-purple-600">
            {customers.reduce((sum, c) => sum + c._count.reports, 0)}
          </div>
          <div className="text-sm text-gray-500 mt-1">Reports Generated</div>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No customers yet. Create your first customer to get started.</p>
          <Link href="/dashboard/customers" className="btn-primary">
            Go to Customers
          </Link>
        </div>
      ) : (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Customers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Devices</th>
                  <th className="pb-3 font-medium">Recipients</th>
                  <th className="pb-3 font-medium">Reports</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{c.name}</td>
                    <td className="py-3">{c._count.devices}</td>
                    <td className="py-3">{c._count.recipients}</td>
                    <td className="py-3">{c._count.reports}</td>
                    <td className="py-3">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
