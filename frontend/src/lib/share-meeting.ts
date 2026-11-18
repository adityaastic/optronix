import type { MeetingDetailsDto } from './types';

function toIcsUtcStamp(iso: string | Date): string {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function downloadMeetingCalendarIcs(meeting: MeetingDetailsDto): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OPTRONIX//Sales Field Operations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${meeting.meetingCode}-${meeting.id}@optronix.com`,
    `DTSTAMP:${toIcsUtcStamp(new Date())}`,
    `DTSTART:${toIcsUtcStamp(meeting.scheduledStart)}`,
    `DTEND:${toIcsUtcStamp(meeting.scheduledEnd)}`,
    `SUMMARY:${escapeIcsText(`${meeting.customer.companyName} — ${meeting.title}`)}`,
    `LOCATION:${escapeIcsText(meeting.locationText)}`,
    `DESCRIPTION:${escapeIcsText(
      `OPTRONIX Meeting ${meeting.meetingCode}\nPurpose: ${meeting.purpose}\nAssigned Rep: ${meeting.assignedRep.fullName}\n${meeting.agenda ? `Agenda: ${meeting.agenda}` : ''}`,
    )}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${meeting.meetingCode}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildWhatsAppMeetingUrl(meeting: MeetingDetailsDto): string {
  const rawPhone = meeting.contact?.phone ?? '';
  const digits = rawPhone.replace(/\D/g, '');
  const normalizedPhone =
    digits.length === 10 ? `91${digits}` : digits.length >= 11 ? digits : '';

  const dateFormatted = new Date(meeting.scheduledStart).toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  );
  const startFormatted = new Date(meeting.scheduledStart).toLocaleTimeString(
    'en-IN',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  );
  const contactGreeting = meeting.contact?.fullName
    ? `Hello ${meeting.contact.fullName.split(' ')[0]},`
    : `Hello ${meeting.customer.companyName} team,`;

  const message =
    meeting.outcome && meeting.status === 'COMPLETED'
      ? `${contactGreeting}\n\nThank you for your time today during our OPTRONIX visit (${meeting.meetingCode} — ${meeting.title}).\n\nSummary: ${meeting.outcome.summary}\n${
          meeting.followUps.length > 0
            ? `Next Action: ${meeting.followUps[0]!.title}\n`
            : ''
        }\nWarm regards,\n${meeting.assignedRep.fullName}\nOPTRONIX`
      : `${contactGreeting}\n\nConfirming our scheduled OPTRONIX meeting (${meeting.meetingCode}):\n• Topic: ${meeting.title}\n• Date & Time: ${dateFormatted} at ${startFormatted}\n• Location: ${meeting.locationText}\n\nLooking forward to speaking with you.\n— ${meeting.assignedRep.fullName}, OPTRONIX`;

  const encoded = encodeURIComponent(message);
  return normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openPrintableMomReport(meeting: MeetingDetailsDto): void {
  const win = window.open('', '_blank', 'width=880,height=920');
  if (!win) {
    window.print();
    return;
  }

  const latestSignedSession = [...meeting.visitSessions]
    .reverse()
    .find(
      (s) =>
        typeof s.signatureDataUrl === 'string' &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
          s.signatureDataUrl,
        ),
    );

  const sessionsRows =
    meeting.visitSessions.length > 0
      ? meeting.visitSessions
          .map(
            (s) => `<tr>
              <td>Session #${s.sessionNumber}</td>
              <td>${new Date(s.checkInAt).toLocaleString('en-IN')}</td>
              <td>${s.checkOutAt ? new Date(s.checkOutAt).toLocaleString('en-IN') : 'Active'}</td>
              <td>${s.netDurationMinutes} min</td>
              <td>${s.checkInTelemetry?.withinGeofence ? 'Verified On-Site' : 'Off-Site'}</td>
            </tr>`,
          )
          .join('')
      : `<tr><td colspan="5">No field visit sessions logged.</td></tr>`;

  const followUpsRows =
    meeting.followUps.length > 0
      ? meeting.followUps
          .map(
            (f) => `<tr>
              <td>${escapeHtml(f.taskCode)}</td>
              <td>${escapeHtml(f.title)}</td>
              <td>${escapeHtml(f.owner?.fullName ?? 'Assigned Rep')}</td>
              <td>${new Date(f.dueDate).toLocaleDateString('en-IN')}</td>
              <td>${escapeHtml(f.status)}</td>
            </tr>`,
          )
          .join('')
      : `<tr><td colspan="5">No follow-up action items recorded.</td></tr>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>OPTRONIX MOM — ${escapeHtml(meeting.meetingCode)}</title>
  <style>
    body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; margin: 36px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 18px; margin-bottom: 24px; }
    .logo { height: 34px; }
    .badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; }
    h1 { font-size: 20px; margin: 0 0 4px 0; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563; margin: 24px 0 8px 0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 6px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; font-size: 13px; background: #fff; }
    .sig-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px; padding-top: 18px; border-top: 1px solid #e5e7eb; }
    .sig-img { max-height: 72px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px; background: #fff; }
    .muted { color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <img src="${window.location.origin}/optronix-logo.png" alt="OPTRONIX" class="logo" />
      <div class="muted" style="margin-top:4px;">Minutes of Meeting &amp; Verified Field Visit Record</div>
    </div>
    <div style="text-align:right;">
      <span class="badge">${escapeHtml(meeting.status)}</span>
      <div class="muted" style="margin-top:6px;">Ref: ${escapeHtml(meeting.meetingCode)}</div>
    </div>
  </div>

  <h1>${escapeHtml(meeting.customer.companyName)} — ${escapeHtml(meeting.title)}</h1>
  <p class="muted">${escapeHtml(meeting.locationText)}</p>

  <div class="grid">
    <div><strong>Scheduled Slot:</strong><br/>${new Date(meeting.scheduledStart).toLocaleString('en-IN')} – ${new Date(meeting.scheduledEnd).toLocaleTimeString('en-IN')}</div>
    <div><strong>Verified Visit Duration:</strong><br/>${meeting.totalActualDurationMinutes} min (${meeting.completedSessionCount} completed session(s))</div>
    <div><strong>Assigned Representative:</strong><br/>${escapeHtml(meeting.assignedRep.fullName)} (${escapeHtml(meeting.assignedRep.employeeCode)})</div>
    <div><strong>Client Stakeholder:</strong><br/>${escapeHtml(meeting.contact ? `${meeting.contact.fullName} (${meeting.contact.email})` : meeting.customer.companyName)}</div>
  </div>

  <h2>Outcome &amp; Discussion Summary</h2>
  <div class="box">
    ${
      meeting.outcome
        ? `<div><strong>Outcome Classification:</strong> ${escapeHtml(meeting.outcome.outcomeType.replace(/_/g, ' '))}</div>
           <p style="margin:8px 0 0 0;">${escapeHtml(meeting.outcome.summary)}</p>
           ${meeting.outcome.minutes ? `<p class="muted" style="margin-top:8px;white-space:pre-line;">${escapeHtml(meeting.outcome.minutes)}</p>` : ''}`
        : '<span class="muted">Outcome pending completion.</span>'
    }
  </div>

  <h2>Verified Visit Sessions</h2>
  <table>
    <thead><tr><th>Session</th><th>Check-In</th><th>Check-Out</th><th>Net Duration</th><th>GPS Verification</th></tr></thead>
    <tbody>${sessionsRows}</tbody>
  </table>

  <h2>Action Items &amp; Follow-Ups</h2>
  <table>
    <thead><tr><th>Code</th><th>Action Item</th><th>Owner</th><th>Due Date</th><th>Status</th></tr></thead>
    <tbody>${followUpsRows}</tbody>
  </table>

  <div class="sig-row">
    <div>
      <div class="muted">Generated by OPTRONIX® Field Governance Platform</div>
      <div class="muted">${new Date().toLocaleString('en-IN')}</div>
    </div>
    <div style="text-align:right;">
      ${
        latestSignedSession?.signatureDataUrl
          ? `<img src="${latestSignedSession.signatureDataUrl}" alt="Client Signature" class="sig-img" /><div class="muted">Verified Client Digital Sign-Off (Session #${latestSignedSession.sessionNumber})</div>`
          : `<div style="width:180px;border-bottom:1px dashed #9ca3af;height:36px;"></div><div class="muted">Client Representative Sign-Off</div>`
      }
    </div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
