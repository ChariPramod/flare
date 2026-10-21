import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '../components/providers';
const sans = localFont({
  src: './fonts/dm-sans-normal.woff2',
  variable: '--font-sans',
  weight: '100 1000',
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});
const display = localFont({
  src: [
    { path: './fonts/source-serif-4-normal.woff2', weight: '200 900', style: 'normal' },
    { path: './fonts/source-serif-4-italic.woff2', weight: '200 900', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
  preload: false,
});
export const metadata: Metadata = {
  title: 'Flare · Pareto Labs',
  description: 'Your notification control plane.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
