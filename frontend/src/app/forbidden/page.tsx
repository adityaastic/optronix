import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { EnterpriseAuthShell } from '@/components/layout/EnterpriseAuthShell';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <EnterpriseAuthShell>
      <div className="w-full max-w-md bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-8 space-y-5">
        <div className="w-10 h-10 rounded-lg bg-error-container text-error flex items-center justify-center">
          <ShieldOff className="w-5 h-5" />
        </div>

        <div className="space-y-1.5">
          <p className="text-caption font-medium text-error">403 · Access denied</p>
          <h1 className="text-headline-md font-semibold text-on-surface">
            You don&apos;t have access to this page
          </h1>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            Your current role does not include permission to view this section
            or record. Contact your administrator if you need access.
          </p>
        </div>

        <div className="pt-2">
          <Button asChild variant="primary">
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </EnterpriseAuthShell>
  );
}
