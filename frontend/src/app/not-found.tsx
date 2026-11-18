import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { EnterpriseAuthShell } from '@/components/layout/EnterpriseAuthShell';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <EnterpriseAuthShell>
      <div className="w-full max-w-md bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-8 space-y-5">
        <div className="w-10 h-10 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center">
          <Compass className="w-5 h-5" />
        </div>

        <div className="space-y-1.5">
          <p className="text-caption font-medium text-on-surface-variant">
            404 · Not found
          </p>
          <h1 className="text-headline-md font-semibold text-on-surface">
            Page not found
          </h1>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            The meeting, customer, or page you requested could not be found or
            may have been archived.
          </p>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <Button asChild variant="primary">
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </EnterpriseAuthShell>
  );
}
