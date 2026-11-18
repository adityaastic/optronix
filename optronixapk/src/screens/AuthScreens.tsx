import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  acceptInviteSchema,
  loginSchema,
  passwordPolicySchema,
} from '../lib/domain';
import { MobileTypewriterText } from '../components/MobileBrandSplash';
import {
  BannerAlert,
  CardSurface,
  FormInput,
  PrimaryButton,
  StatusPill,
} from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme/tokens';
import optronixLogo from '../../assets/optronix-logo.png';

type AuthMode = 'login' | 'invite' | 'forgot' | 'reset';

interface VerifiedInviteDto {
  email: string;
  fullName: string;
  employeeCode: string;
  territory: string | null;
  role: { code: string; name: string };
}

const DEMO_ACCOUNTS = [
  {
    label: 'Sales Employee',
    email: 'aditya.sharma@optronix.com',
    pass: 'Optronix@2026!',
  },
  {
    label: 'Sales Manager',
    email: 'priya.mehta@optronix.com',
    pass: 'Optronix@2026!',
  },
  {
    label: 'Administrator',
    email: 'vikramaditya.roy@optronix.com',
    pass: 'Optronix@2026!',
  },
] as const;

export function AuthScreens({ introReady = true }: { introReady?: boolean }) {
  const { login, acceptInvitation } = useMobileAuth();
  const entryAnim = useRef(new Animated.Value(introReady ? 1 : 0)).current;

  useEffect(() => {
    if (introReady) {
      Animated.timing(entryAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [entryAnim, introReady]);

  const [mode, setMode] = useState<AuthMode>('login');
  const [banner, setBanner] = useState<{
    tone: 'success' | 'error' | 'info';
    msg: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [showDemo, setShowDemo] = useState(false);

  // Invite state
  const [rawInviteInput, setRawInviteInput] = useState('');
  const [verifiedInvite, setVerifiedInvite] =
    useState<VerifiedInviteDto | null>(null);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirm, setInviteConfirm] = useState('');
  const [invitePhone, setInvitePhone] = useState('');

  // Forgot / Reset state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const extractToken = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/[?&]token=([^&]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : trimmed;
  };

  const handleSignIn = async () => {
    setBanner(null);
    setFieldErr({});
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextErr: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'email');
        if (!nextErr[key]) nextErr[key] = issue.message;
      }
      setFieldErr(nextErr);
      return;
    }

    setBusy(true);
    try {
      await login(parsed.data.email, parsed.data.password);
    } catch (err) {
      setBanner({
        tone: 'error',
        msg:
          err instanceof MobileApiError
            ? err.message
            : 'Unable to sign in. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyInvite = async () => {
    setBanner(null);
    const token = extractToken(rawInviteInput);
    if (token.length < 24) {
      setFieldErr({
        inviteToken: 'Paste the invitation link or 64-character token.',
      });
      return;
    }
    setFieldErr({});
    setBusy(true);
    try {
      const res = await mobileApiFetch<{ invitation: VerifiedInviteDto }>(
        '/auth/invite/verify',
        {
          query: { token },
          skipAuthRefresh: true,
        },
      );
      setRawInviteInput(token);
      setVerifiedInvite(res.data.invitation);
    } catch (err) {
      setVerifiedInvite(null);
      setBanner({
        tone: 'error',
        msg:
          err instanceof MobileApiError
            ? err.message
            : 'Invalid or expired invitation link.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleActivateInvite = async () => {
    setBanner(null);
    const token = extractToken(rawInviteInput);
    const parsed = acceptInviteSchema.safeParse({
      token,
      password: invitePassword,
      confirmPassword: inviteConfirm,
      phone: invitePhone.trim() || undefined,
    });
    if (!parsed.success) {
      const nextErr: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'password');
        if (!nextErr[key]) nextErr[key] = issue.message;
      }
      setFieldErr(nextErr);
      return;
    }
    setFieldErr({});
    setBusy(true);
    try {
      await acceptInvitation(parsed.data);
    } catch (err) {
      setBanner({
        tone: 'error',
        msg:
          err instanceof MobileApiError
            ? err.message
            : 'Unable to activate invitation.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRequestReset = async () => {
    setBanner(null);
    if (!resetEmail.includes('@')) {
      setFieldErr({ resetEmail: 'Enter a valid work email.' });
      return;
    }
    setFieldErr({});
    setBusy(true);
    try {
      const res = await mobileApiFetch<{
        message: string;
        debugResetToken?: string;
      }>('/auth/forgot-password', {
        method: 'POST',
        body: { email: resetEmail.trim().toLowerCase() },
        skipAuthRefresh: true,
      });
      if (res.data.debugResetToken) {
        setResetToken(res.data.debugResetToken);
      }
      setBanner({ tone: 'success', msg: res.data.message });
      setMode('reset');
    } catch (err) {
      setBanner({
        tone: 'error',
        msg:
          err instanceof MobileApiError
            ? err.message
            : 'Unable to request password reset.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReset = async () => {
    setBanner(null);
    const pwCheck = passwordPolicySchema.safeParse(newResetPassword);
    if (!pwCheck.success) {
      setFieldErr({
        newResetPassword: pwCheck.error.issues[0]?.message ?? 'Weak password',
      });
      return;
    }
    if (newResetPassword !== confirmResetPassword) {
      setFieldErr({ confirmResetPassword: 'Passwords do not match.' });
      return;
    }
    setFieldErr({});
    setBusy(true);
    try {
      await mobileApiFetch('/auth/reset-password', {
        method: 'POST',
        body: {
          token: resetToken.trim(),
          newPassword: newResetPassword,
          confirmPassword: confirmResetPassword,
          invalidateRemoteSessions: true,
        },
        skipAuthRefresh: true,
      });
      setBanner({
        tone: 'success',
        msg: 'Password updated. Sign in with your new credentials.',
      });
      setMode('login');
    } catch (err) {
      setBanner({
        tone: 'error',
        msg:
          err instanceof MobileApiError
            ? err.message
            : 'Invalid or expired reset token.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            styles.container,
            {
              opacity: entryAnim,
              transform: [
                {
                  translateY: entryAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Brand Header */}
          <View style={styles.brandCol}>
            <Image
              source={optronixLogo}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <View style={{ minHeight: 16 }}>
              <MobileTypewriterText
                text="FIELD SALES WORKSPACE"
                active={introReady}
                startDelayMs={60}
                speedMs={24}
                style={styles.brandTag}
              />
            </View>
          </View>

          <CardSurface style={{ gap: SPACING.lg }}>
            {banner ? (
              <BannerAlert
                tone={banner.tone}
                message={banner.msg}
                onDismiss={() => setBanner(null)}
              />
            ) : null}

            {mode === 'login' ? (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={styles.heading}>Sign in</Text>
                  <View style={{ minHeight: 19 }}>
                    <MobileTypewriterText
                      text="Schedule meetings, verify GPS visits & close follow-ups."
                      active={introReady}
                      startDelayMs={520}
                      speedMs={18}
                      style={styles.subtext}
                    />
                  </View>
                </View>

                <FormInput
                  label="Work email"
                  required
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@optronix.com"
                  value={email}
                  onChangeText={setEmail}
                  error={fieldErr.email}
                />

                <FormInput
                  label="Password"
                  required
                  secureTextEntry
                  placeholder="••••••••••••"
                  value={password}
                  onChangeText={setPassword}
                  error={fieldErr.password}
                />

                <PrimaryButton
                  label="Sign in"
                  size="lg"
                  loading={busy}
                  onPress={() => void handleSignIn()}
                />

                <View style={styles.linksRow}>
                  <Pressable
                    onPress={() => {
                      setBanner(null);
                      setMode('invite');
                    }}
                  >
                    <Text style={styles.linkText}>Have an invite link?</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setBanner(null);
                      setMode('forgot');
                    }}
                  >
                    <Text style={styles.linkText}>Forgot password?</Text>
                  </Pressable>
                </View>

                {/* Progressive Disclosure: Demo Personas */}
                <View style={styles.dividerSection}>
                  <Pressable
                    onPress={() => setShowDemo((v) => !v)}
                    style={styles.disclosureHeader}
                  >
                    <Text style={styles.disclosureLabel}>
                      Demo accounts (tap to autofill)
                    </Text>
                    <Feather
                      name={showDemo ? 'chevron-up' : 'chevron-down'}
                      size={15}
                      color={COLORS.textMuted}
                    />
                  </Pressable>

                  {showDemo ? (
                    <View style={{ gap: 6, marginTop: 8 }}>
                      {DEMO_ACCOUNTS.map((d) => (
                        <Pressable
                          key={d.email}
                          onPress={() => {
                            setEmail(d.email);
                            setPassword(d.pass);
                            setFieldErr({});
                          }}
                          style={styles.demoRow}
                        >
                          <Text style={styles.demoRole}>{d.label}</Text>
                          <Text style={styles.demoEmail}>{d.email}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {mode === 'invite' ? (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={styles.heading}>Accept invitation</Text>
                  <Text style={styles.subtext}>
                    Verify your single-use admin invitation and set your initial
                    password.
                  </Text>
                </View>

                {!verifiedInvite ? (
                  <>
                    <FormInput
                      label="Invitation link or token"
                      required
                      autoCapitalize="none"
                      placeholder="Paste /invite?token=... or token"
                      value={rawInviteInput}
                      onChangeText={setRawInviteInput}
                      error={fieldErr.inviteToken}
                    />
                    <PrimaryButton
                      label="Verify invitation"
                      loading={busy}
                      onPress={() => void handleVerifyInvite()}
                    />
                  </>
                ) : (
                  <>
                    <View style={styles.inviteProfileBox}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={styles.inviteName}>
                          {verifiedInvite.fullName}
                        </Text>
                        <StatusPill
                          status="INFO"
                          labelOverride={verifiedInvite.role.name}
                          toneOverride="blue"
                        />
                      </View>
                      <Text style={styles.subtext}>
                        {verifiedInvite.email} · {verifiedInvite.employeeCode}
                      </Text>
                    </View>

                    <FormInput
                      label="Set password"
                      required
                      hint="10+ chars, upper, lower, digit, symbol"
                      secureTextEntry
                      value={invitePassword}
                      onChangeText={setInvitePassword}
                      error={fieldErr.password}
                    />
                    <FormInput
                      label="Confirm password"
                      required
                      secureTextEntry
                      value={inviteConfirm}
                      onChangeText={setInviteConfirm}
                      error={fieldErr.confirmPassword}
                    />
                    <FormInput
                      label="Mobile number"
                      hint="Optional"
                      keyboardType="phone-pad"
                      placeholder="+91 98100 00000"
                      value={invitePhone}
                      onChangeText={setInvitePhone}
                      error={fieldErr.phone}
                    />
                    <PrimaryButton
                      label="Activate account & continue"
                      size="lg"
                      loading={busy}
                      onPress={() => void handleActivateInvite()}
                    />
                  </>
                )}

                <PrimaryButton
                  label="Back to sign in"
                  variant="ghost"
                  onPress={() => {
                    setVerifiedInvite(null);
                    setMode('login');
                  }}
                />
              </>
            ) : null}

            {mode === 'forgot' ? (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={styles.heading}>Reset password</Text>
                  <Text style={styles.subtext}>
                    Enter your work email to request a single-use reset token.
                  </Text>
                </View>

                <FormInput
                  label="Work email"
                  required
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@optronix.com"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  error={fieldErr.resetEmail}
                />
                <PrimaryButton
                  label="Request reset link"
                  loading={busy}
                  onPress={() => void handleRequestReset()}
                />
                <PrimaryButton
                  label="Back to sign in"
                  variant="ghost"
                  onPress={() => setMode('login')}
                />
              </>
            ) : null}

            {mode === 'reset' ? (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={styles.heading}>Set new password</Text>
                  <Text style={styles.subtext}>
                    Enter your reset token and choose a new password.
                  </Text>
                </View>

                <FormInput
                  label="Reset token"
                  required
                  autoCapitalize="none"
                  value={resetToken}
                  onChangeText={setResetToken}
                />
                <FormInput
                  label="New password"
                  required
                  secureTextEntry
                  value={newResetPassword}
                  onChangeText={setNewResetPassword}
                  error={fieldErr.newResetPassword}
                />
                <FormInput
                  label="Confirm password"
                  required
                  secureTextEntry
                  value={confirmResetPassword}
                  onChangeText={setConfirmResetPassword}
                  error={fieldErr.confirmResetPassword}
                />
                <PrimaryButton
                  label="Update password"
                  loading={busy}
                  onPress={() => void handleConfirmReset()}
                />
                <PrimaryButton
                  label="Back to sign in"
                  variant="ghost"
                  onPress={() => setMode('login')}
                />
              </>
            ) : null}
          </CardSurface>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: SPACING.xl,
  },
  brandCol: {
    alignItems: 'flex-start',
    gap: 6,
  },
  brandLogo: {
    width: 190,
    height: 34,
  },
  brandTag: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
    color: COLORS.accent,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtext: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },
  dividerSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  disclosureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disclosureLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    flex: 1,
  },
  demoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  demoRole: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  demoEmail: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  pingText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  inviteProfileBox: {
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  inviteName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
});
