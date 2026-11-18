import React from 'react';
import Link from 'next/link';

export function EnterpriseAuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-between">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/login" className="inline-flex items-center gap-2.5">
          <img
            src="/optronix-logo.png"
            alt="Optronix"
            className="h-7 w-auto object-contain"
          />
        </Link>
        <span className="text-caption text-on-surface-variant">
          Sales &amp; Visit Operations
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 w-full">
        {children}
      </main>

      <footer className="w-full px-6 py-5 text-center text-caption text-on-surface-variant">
        © {new Date().getFullYear()} Optronix Technologies · Internal Workspace
      </footer>
    </div>
  );
}
