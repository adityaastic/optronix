import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/hooks/use-auth';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OPTRONIX — Sales Meeting & Visit Management',
  description: 'Enterprise Sales Meeting & Field Visit Governance Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="font-sans bg-surface text-on-surface antialiased min-h-screen"
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
