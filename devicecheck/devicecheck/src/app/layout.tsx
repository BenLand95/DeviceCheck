import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DeviceCheck - Device Status Monitor',
  description: 'Monitor signageOS device status and generate reports',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
