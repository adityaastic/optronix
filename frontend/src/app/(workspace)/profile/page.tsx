'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Mail, MapPin, Save } from 'lucide-react';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  FormField,
  StatusBanner,
  useUnsavedChangesWarning,
} from '@/components/shared/FormField';
import { PageSkeleton } from '@/components/shared/FeedbackStates';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function UserProfilePage() {
  const { user, refreshSession } = useAuth();

  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    reset: resetProfile,
    formState: {
      errors: profileErrors,
      isSubmitting: profileSaving,
      isDirty: profileDirty,
    },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
    },
  });

  useUnsavedChangesWarning(profileDirty);

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPassword,
    formState: { errors: pwdErrors, isSubmitting: pwdSaving },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      invalidateRemoteSessions: true,
    },
  });

  useEffect(() => {
    if (user) {
      resetProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? '',
      });
    }
  }, [user, resetProfile]);

  if (!user) {
    return <PageSkeleton />;
  }

  const onSaveProfile = async (values: UpdateProfileInput) => {
    setProfileMsg(null);
    setProfileErr(null);
    try {
      await apiFetch('/auth/profile', {
        method: 'PATCH',
        body: {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          phone: values.phone?.trim() ?? '',
        },
      });
      await refreshSession();
      setProfileMsg('Profile details saved.');
    } catch (err) {
      setProfileErr(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to update profile. Your changes have been preserved.',
      );
    }
  };

  const onChangePassword = async (values: ChangePasswordInput) => {
    setPwdMsg(null);
    setPwdErr(null);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: values,
      });
      resetPassword({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        invalidateRemoteSessions: true,
      });
      setPwdMsg('Password updated.');
    } catch (err) {
      setPwdErr(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to update password.',
      );
    }
  };

  const initials =
    `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="space-y-8 max-w-4xl pb-12">
      <PageHeader
        title="Profile & security"
        description="Manage your contact details, password, and active sessions."
      />

      {/* Clean Identity Summary */}
      <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-surface-container text-on-surface flex items-center justify-center text-headline-sm font-semibold">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-headline-sm font-semibold text-on-surface">
                {user.fullName}
              </h2>
              <StatusBadge status={user.status} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-body-sm text-on-surface-variant mt-1">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {user.email}
              </span>
              <span>·</span>
              <span className="tabular-nums">{user.employeeCode}</span>
              {user.territory ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {user.territory}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <span className="px-2.5 py-1 rounded-md bg-surface-container text-on-surface text-caption font-medium">
            {user.role.name}
          </span>
          {user.lastLoginAt ? (
            <p className="text-caption text-on-surface-variant mt-1.5 tabular-nums">
              Last sign-in:{' '}
              {format(new Date(user.lastLoginAt), 'dd MMM yyyy, HH:mm')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Personal Details Form */}
        <section className="bg-surface-container-lowest rounded-xl border border-hairline p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-headline-sm font-semibold text-on-surface">
              Personal information
            </h2>
            <p className="text-caption text-on-surface-variant mt-0.5">
              Displayed to customers and team members on scheduled meetings.
            </p>
          </div>

          <form
            onSubmit={handleSubmitProfile(onSaveProfile)}
            noValidate
            className="space-y-4"
          >
            {profileMsg ? (
              <StatusBanner
                tone="success"
                message={profileMsg}
                onDismiss={() => setProfileMsg(null)}
              />
            ) : null}
            {profileErr ? (
              <StatusBanner
                tone="error"
                message={profileErr}
                onDismiss={() => setProfileErr(null)}
              />
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                label="First name"
                htmlFor="prof-first"
                required
                error={profileErrors.firstName?.message}
              >
                <Input
                  id="prof-first"
                  aria-invalid={Boolean(profileErrors.firstName)}
                  {...registerProfile('firstName')}
                />
              </FormField>

              <FormField
                label="Last name"
                htmlFor="prof-last"
                required
                error={profileErrors.lastName?.message}
              >
                <Input
                  id="prof-last"
                  aria-invalid={Boolean(profileErrors.lastName)}
                  {...registerProfile('lastName')}
                />
              </FormField>
            </div>

            <FormField
              label="Phone number"
              htmlFor="prof-phone"
              hint="Optional"
              error={profileErrors.phone?.message}
            >
              <Input
                id="prof-phone"
                type="tel"
                aria-invalid={Boolean(profileErrors.phone)}
                placeholder="+91 98100 00000"
                {...registerProfile('phone')}
              />
            </FormField>

            <FormField
              label="Work email"
              htmlFor="prof-email"
              hint="Managed by admin"
            >
              <Input id="prof-email" value={user.email} disabled />
            </FormField>

            <div className="pt-1">
              <Button
                type="submit"
                variant="primary"
                disabled={profileSaving}
              >
                <Save className="w-4 h-4" />
                {profileSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        </section>

        {/* Password & Session Security Form */}
        <section className="bg-surface-container-lowest rounded-xl border border-hairline p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-headline-sm font-semibold text-on-surface">
              Change password
            </h2>
            <p className="text-caption text-on-surface-variant mt-0.5">
              Use at least 10 characters with uppercase, lowercase, a number,
              and a symbol.
            </p>
          </div>

          <form
            onSubmit={handleSubmitPassword(onChangePassword)}
            noValidate
            className="space-y-4"
          >
            {pwdMsg ? (
              <StatusBanner
                tone="success"
                message={pwdMsg}
                onDismiss={() => setPwdMsg(null)}
              />
            ) : null}
            {pwdErr ? (
              <StatusBanner
                tone="error"
                message={pwdErr}
                onDismiss={() => setPwdErr(null)}
              />
            ) : null}

            <FormField
              label="Current password"
              htmlFor="cur-pwd"
              required
              error={pwdErrors.currentPassword?.message}
            >
              <Input
                id="cur-pwd"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(pwdErrors.currentPassword)}
                {...registerPassword('currentPassword')}
              />
            </FormField>

            <FormField
              label="New password"
              htmlFor="new-pwd"
              required
              error={pwdErrors.newPassword?.message}
            >
              <Input
                id="new-pwd"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(pwdErrors.newPassword)}
                {...registerPassword('newPassword')}
              />
            </FormField>

            <FormField
              label="Confirm new password"
              htmlFor="conf-pwd"
              required
              error={pwdErrors.confirmPassword?.message}
            >
              <Input
                id="conf-pwd"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(pwdErrors.confirmPassword)}
                {...registerPassword('confirmPassword')}
              />
            </FormField>

            <label className="flex items-center gap-2.5 text-body-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-secondary"
                {...registerPassword('invalidateRemoteSessions')}
              />
              <span>Sign out other devices after updating password</span>
            </label>

            <div className="pt-1">
              <Button type="submit" variant="primary" disabled={pwdSaving}>
                <KeyRound className="w-4 h-4" />
                {pwdSaving ? 'Updating...' : 'Update password'}
              </Button>
            </div>
          </form>
        </section>
      </div>

      {/* Progressive Disclosure for Effective Role Permissions */}
      <details className="bg-surface-container-lowest rounded-xl border border-hairline p-4 sm:p-5">
        <summary className="text-label-md font-medium text-on-surface cursor-pointer select-none">
          View assigned role permissions ({user.permissions.length})
        </summary>
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-hairline">
          {user.permissions.map((perm) => (
            <code
              key={perm}
              className="px-2.5 py-1 rounded-md bg-surface-container-low border border-hairline text-caption text-on-surface"
            >
              {perm}
            </code>
          ))}
        </div>
      </details>
    </div>
  );
}
