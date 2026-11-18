import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { SystemSettingModel } from '../models/SystemSetting.model.js';

export interface EmailDeliveryResult {
  delivered: boolean;
  mode: 'smtp' | 'ethereal' | 'test-bypass' | 'disabled';
  previewUrl?: string | null;
  error?: string | null;
}

let cachedEtherealAccount: { user: string; pass: string } | null = null;

async function resolveTransporter(): Promise<{
  transporter: Transporter | null;
  fromAddress: string;
  mode: EmailDeliveryResult['mode'];
}> {
  if (env.NODE_ENV === 'test') {
    return {
      transporter: null,
      fromAddress: 'no-reply@optronix.local',
      mode: 'test-bypass',
    };
  }

  const sysSettings = await SystemSettingModel.findOne({
    singletonKey: 'DEFAULT',
  }).lean();

  const smtpUser = (
    sysSettings?.smtpSenderEmail?.trim() ||
    env.SMTP_USER?.trim() ||
    ''
  ).trim();
  const smtpPass = (env.SMTP_PASS ?? '').replace(/\s+/g, '');
  const orgName = sysSettings?.organizationName || env.SMTP_FROM_NAME;

  if (smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    return {
      transporter,
      fromAddress: `"${orgName}" <${smtpUser}>`,
      mode: 'smtp',
    };
  }

  // Fallback to live Ethereal SMTP inbox so emails are genuinely rendered & inspectable
  if (!cachedEtherealAccount) {
    const testAcc = await nodemailer.createTestAccount();
    cachedEtherealAccount = { user: testAcc.user, pass: testAcc.pass };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: cachedEtherealAccount,
  });

  return {
    transporter,
    fromAddress: `"${orgName}" <${cachedEtherealAccount.user}>`,
    mode: 'ethereal',
  };
}

export async function sendInvitationEmail(params: {
  to: string;
  fullName: string;
  roleName: string;
  invitePath: string;
  expiresAt: Date;
}): Promise<EmailDeliveryResult> {
  try {
    const { transporter, fromAddress, mode } = await resolveTransporter();
    if (!transporter) {
      return { delivered: true, mode };
    }

    const baseWeb = env.APP_WEB_URL.replace(/\/+$/, '');
    const inviteUrl = `${baseWeb}${params.invitePath}`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: params.to,
      subject: 'Your Optronix Workspace Invitation',
      text: `Hello ${params.fullName},\n\nYou have been invited to join Optronix as ${params.roleName}.\nActivate your account before ${params.expiresAt.toUTCString()}:\n${inviteUrl}\n`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;border:1px solid #e5e7eb;border-radius:12px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:20px;">Welcome to Optronix</h2>
          <p style="margin:0 0 16px 0;color:#4b5563;font-size:14px;line-height:1.5;">
            Hello <strong>${params.fullName}</strong>, your administrator has invited you to join the workspace with the role <strong>${params.roleName}</strong>.
          </p>
          <p style="margin:0 0 20px 0;">
            <a href="${inviteUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">
              Set Password &amp; Activate Account
            </a>
          </p>
          <p style="margin:0;color:#6b7280;font-size:12px;">
            This single-use link expires on ${params.expiresAt.toUTCString()}.<br/>
            Direct URL: <a href="${inviteUrl}" style="color:#2563eb;">${inviteUrl}</a>
          </p>
        </div>
      `,
    });

    const preview =
      mode === 'ethereal' ? nodemailer.getTestMessageUrl(info) || null : null;
    return { delivered: true, mode, previewUrl: preview };
  } catch (err) {
    return {
      delivered: false,
      mode: 'disabled',
      error: err instanceof Error ? err.message : 'SMTP delivery failed',
    };
  }
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName: string;
  rawToken: string;
}): Promise<EmailDeliveryResult> {
  try {
    const { transporter, fromAddress, mode } = await resolveTransporter();
    if (!transporter) {
      return { delivered: true, mode };
    }

    const baseWeb = env.APP_WEB_URL.replace(/\/+$/, '');
    const resetUrl = `${baseWeb}/reset-password?token=${encodeURIComponent(params.rawToken)}`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: params.to,
      subject: 'Reset your Optronix password',
      text: `Hello ${params.fullName},\n\nUse this single-use link within 30 minutes to reset your password:\n${resetUrl}\n`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;border:1px solid #e5e7eb;border-radius:12px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:20px;">Password Reset Request</h2>
          <p style="margin:0 0 16px 0;color:#4b5563;font-size:14px;line-height:1.5;">
            Hello <strong>${params.fullName}</strong>, click below within 30 minutes to set a new password.
          </p>
          <p style="margin:0 0 20px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">
              Reset Password
            </a>
          </p>
          <p style="margin:0;color:#6b7280;font-size:12px;">
            Direct URL: <a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a>
          </p>
        </div>
      `,
    });

    const preview =
      mode === 'ethereal' ? nodemailer.getTestMessageUrl(info) || null : null;
    return { delivered: true, mode, previewUrl: preview };
  } catch (err) {
    return {
      delivered: false,
      mode: 'disabled',
      error: err instanceof Error ? err.message : 'SMTP delivery failed',
    };
  }
}
