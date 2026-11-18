import React from 'react';
import { EnterpriseAuthShell } from '@/components/layout/EnterpriseAuthShell';

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EnterpriseAuthShell>{children}</EnterpriseAuthShell>;
}
