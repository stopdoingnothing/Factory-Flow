import * as postmark from 'postmark';

const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_API_KEY || process.env.POSTMARK_SERVER_TOKEN;

let client: postmark.ServerClient | null = null;

function getClient(): postmark.ServerClient | null {
  if (!POSTMARK_SERVER_TOKEN) {
    console.warn('POSTMARK_SERVER_TOKEN not configured - email sending disabled');
    return null;
  }
  if (!client) {
    client = new postmark.ServerClient(POSTMARK_SERVER_TOKEN);
  }
  return client;
}

export interface LeaveRequestEmailData {
  employeeName: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  department?: string;
  requestId?: number;
  appUrl?: string;
  requestedDays?: number;
  totalDays?: number;
  consumedDays?: number;
  availableDays?: number;
}

export async function sendLeaveRequestNotification(
  adminEmail: string,
  fromEmail: string,
  data: LeaveRequestEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping notification');
    return false;
  }

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: adminEmail,
      Subject: `New Leave Request from ${data.employeeName}`,
      MessageStream: "dev-stream",
      HtmlBody: `
        <h2>New Leave Request Submitted</h2>
        <p>A new leave request has been submitted and requires your attention.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee Name:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.employeeId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Department:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.department || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Leave Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.leaveType}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Start Date:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.startDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>End Date:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.endDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Reason:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.reason}</td>
          </tr>
          ${data.requestedDays !== undefined ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Working Days Requested:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.requestedDays} day${data.requestedDays !== 1 ? 's' : ''}</td>
          </tr>
          ` : ''}
        </table>
        ${data.totalDays !== undefined ? `
        <div style="margin-top:16px; padding:12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px;">
          <p style="margin:0 0 8px; font-weight:bold; color:#15803d; font-size:14px;">Leave Balance (${data.leaveType})</p>
          <table style="width:100%; border-collapse:collapse; text-align:center;">
            <tr>
              <td style="padding:8px;">
                <div style="font-size:11px; color:#666;">Total</div>
                <div style="font-weight:bold; font-size:16px;">${data.totalDays}</div>
              </td>
              <td style="padding:8px;">
                <div style="font-size:11px; color:#666;">Previously Consumed</div>
                <div style="font-weight:bold; font-size:16px; color:#d97706;">${data.consumedDays ?? 0}</div>
              </td>
              <td style="padding:8px;">
                <div style="font-size:11px; color:#666;">This Request</div>
                <div style="font-weight:bold; font-size:16px; color:#2563eb;">${data.requestedDays ?? 0}</div>
              </td>
              <td style="padding:8px;">
                <div style="font-size:11px; color:#666;">Remaining After</div>
                <div style="font-weight:bold; font-size:16px; color:${(data.availableDays ?? 0) < 0 ? '#dc2626' : '#16a34a'};">${data.availableDays ?? 0}</div>
              </td>
            </tr>
          </table>
          ${(data.availableDays ?? 0) < 0 ? '<p style="margin:8px 0 0; color:#dc2626; font-size:12px; font-weight:bold;">Warning: This request exceeds the employee\'s available balance.</p>' : ''}
        </div>
        ` : ''}
        ${data.appUrl && data.requestId ? `
        <p style="margin-top: 20px;">
          <a href="${data.appUrl}/admin?section=leave-requests&requestId=${data.requestId}"
             style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Review Leave Request
          </a>
        </p>
        ` : ''}
        <p style="margin-top: 20px; color: #666;">Please log in to the AECE Checkpoint admin portal to review and approve/reject this request.</p>
      `,
      TextBody: `
New Leave Request Submitted

Employee Name: ${data.employeeName}
Employee ID: ${data.employeeId}
Department: ${data.department || 'N/A'}
Leave Type: ${data.leaveType}
Start Date: ${data.startDate}
End Date: ${data.endDate}
Reason: ${data.reason}
${data.requestedDays !== undefined ? `Working Days Requested: ${data.requestedDays}` : ''}
${data.totalDays !== undefined ? `
Leave Balance (${data.leaveType}):
  Total:                ${data.totalDays}
  Previously Consumed:  ${data.consumedDays ?? 0}
  This Request:         ${data.requestedDays ?? 0}
  Remaining After:      ${data.availableDays ?? 0}${(data.availableDays ?? 0) < 0 ? ' (EXCEEDS BALANCE)' : ''}
` : ''}
${data.appUrl && data.requestId ? `Review this request: ${data.appUrl}/admin?section=leave-requests&requestId=${data.requestId}` : ''}

Please log in to the AECE Checkpoint admin portal to review and approve/reject this request.
      `.trim(),
    });
    
    console.log('Leave request notification sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send leave request notification:', error);
    return false;
  }
}

export interface LateAttendanceEmailData {
  employeeName: string;
  firstName: string;
  surname: string;
  employeeId: string;
  department?: string;
  type: 'late_arrival' | 'early_departure';
  actualTime: string;
  cutoffTime: string;
  customMessage?: string;
  infringementReason?: string;
}

export async function sendLateAttendanceNotification(
  adminEmail: string,
  fromEmail: string,
  data: LateAttendanceEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping late notification');
    return false;
  }

  const isLate = data.type === 'late_arrival';
  const reasonSuffix = data.infringementReason ? ' (Reason Provided)' : '';
  const subject = isLate
    ? `Late Arrival${reasonSuffix}: ${data.employeeName}`
    : `Early Departure${reasonSuffix}: ${data.employeeName}`;
  const typeLabel = isLate ? 'Late Arrival' : 'Early Departure';
  const timeLabel = isLate ? 'Arrival Time' : 'Departure Time';
  const cutoffLabel = isLate ? 'Expected by' : 'Expected after';

  // Process custom message with placeholders
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-ZA');
  let messageBody = data.customMessage || `${data.employeeName} (ID: ${data.employeeId}) ${isLate ? 'clocked in late' : 'left early'} at ${data.actualTime}. ${cutoffLabel} ${data.cutoffTime}.`;
  
  messageBody = messageBody
    .replace(/\{firstName\}/g, data.firstName)
    .replace(/\{surname\}/g, data.surname)
    .replace(/\{name\}/g, data.employeeName)
    .replace(/\{id\}/g, data.employeeId)
    .replace(/\{department\}/g, data.department || 'N/A')
    .replace(/\{time\}/g, data.actualTime)
    .replace(/\{cutoff\}/g, data.cutoffTime)
    .replace(/\{date\}/g, dateStr);

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: adminEmail,
      Subject: subject,
      MessageStream: "dev-stream",
      HtmlBody: `
        <h2 style="color: #dc2626;">Attendance Infringement: ${typeLabel}</h2>
        <div style="background-color: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 0; font-size: 16px;">${messageBody}</p>
        </div>
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee Name:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.employeeId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Department:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.department || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Infringement Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd; color: #dc2626; font-weight: bold;">${typeLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>${timeLabel}:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.actualTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>${cutoffLabel}:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.cutoffTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Reason Given:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd; ${data.infringementReason ? 'color: #1e293b;' : 'color: #94a3b8; font-style: italic;'}">${data.infringementReason || 'No reason provided'}</td>
          </tr>
        </table>
        <p style="margin-top: 20px; color: #666; font-size: 12px;">This notification was automatically generated by AECE Checkpoint.</p>
      `,
      TextBody: `
Attendance Infringement: ${typeLabel}

${messageBody}

Employee Name: ${data.employeeName}
Employee ID: ${data.employeeId}
Department: ${data.department || 'N/A'}
Infringement Type: ${typeLabel}
${timeLabel}: ${data.actualTime}
${cutoffLabel}: ${data.cutoffTime}
Reason Given: ${data.infringementReason || 'No reason provided'}

This notification was automatically generated by AECE Checkpoint.
      `.trim(),
    });
    
    console.log('Late attendance notification sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send late attendance notification:', error);
    return false;
  }
}

export interface AdminWelcomeEmailData {
  firstName: string;
  surname: string;
  email: string;
  password: string;
  loginUrl?: string;
}

export async function sendAdminWelcomeEmail(
  toEmail: string,
  fromEmail: string,
  data: AdminWelcomeEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping welcome email');
    return false;
  }

  const fullName = `${data.firstName} ${data.surname}`;
  const loginUrl = data.loginUrl || `${process.env.APP_URL || 'http://localhost:5000'}/login`;

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: `Welcome to AECE Checkpoint - Your Admin Account`,
      MessageStream: "dev-stream",
      HtmlBody: `
        <h2>Welcome to AECE Checkpoint, ${data.firstName}!</h2>
        <p>Your administrator account has been created. You can now log in to manage employees, attendance, and leave requests.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Your Login Credentials</h3>
          <table style="border-collapse: collapse; width: 100%;">
            <tr>
              <td style="padding: 8px 0;"><strong>Email:</strong></td>
              <td style="padding: 8px 0;">${data.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Password:</strong></td>
              <td style="padding: 8px 0; font-family: monospace; background-color: #fff; padding: 8px; border-radius: 4px;">${data.password}</td>
            </tr>
          </table>
        </div>
        
        <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
        
        <p style="margin-top: 30px;">
          <a href="${loginUrl}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Log In to AECE Checkpoint</a>
        </p>
        
        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          If you did not request this account, please contact your HR administrator.
        </p>
      `,
      TextBody: `
Welcome to AECE Checkpoint, ${data.firstName}!

Your administrator account has been created. You can now log in to manage employees, attendance, and leave requests.

Your Login Credentials:
Email: ${data.email}
Password: ${data.password}

Important: Please change your password after your first login for security purposes.

Log in at: ${loginUrl}

If you did not request this account, please contact your HR administrator.
      `.trim(),
    });
    
    console.log('Admin welcome email sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send admin welcome email:', error);
    return false;
  }
}

export interface LeaveStatusUpdateEmailData {
  employeeName: string;
  employeeEmail: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: 'approved' | 'rejected';
}

export async function sendLeaveStatusNotification(
  toEmail: string,
  fromEmail: string,
  data: LeaveStatusUpdateEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping leave status notification');
    return false;
  }

  const isApproved = data.status === 'approved';
  const statusColor = isApproved ? '#10b981' : '#ef4444';
  const statusText = isApproved ? 'Approved' : 'Rejected';

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: `Leave Request ${statusText} - ${data.leaveType}`,
      MessageStream: "dev-stream",
      HtmlBody: `
        <h2>Leave Request Update</h2>
        <p>Hello ${data.employeeName},</p>
        <p>Your leave request has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong>.</p>
        
        <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Leave Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.leaveType}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Start Date:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.startDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>End Date:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.endDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Status:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd; color: ${statusColor};"><strong>${statusText}</strong></td>
          </tr>
        </table>
        
        ${isApproved 
          ? '<p>Enjoy your time off!</p>' 
          : '<p>If you have questions about this decision, please contact your manager or HR.</p>'
        }
        
        <p style="margin-top: 30px; color: #666; font-size: 12px;">This notification was automatically generated by AECE Checkpoint.</p>
      `,
      TextBody: `
Leave Request Update

Hello ${data.employeeName},

Your leave request has been ${statusText.toLowerCase()}.

Leave Type: ${data.leaveType}
Start Date: ${data.startDate}
End Date: ${data.endDate}
Status: ${statusText}

${isApproved ? 'Enjoy your time off!' : 'If you have questions about this decision, please contact your manager or HR.'}

This notification was automatically generated by AECE Checkpoint.
      `.trim(),
    });
    
    console.log('Leave status notification sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send leave status notification:', error);
    return false;
  }
}

export interface AdminCredentialsEmailData {
  firstName: string;
  surname: string;
  email: string;
  password: string;
  siteUrl: string;
}

export async function sendAdminCredentialsEmail(
  toEmail: string,
  fromEmail: string,
  data: AdminCredentialsEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping credentials email');
    return false;
  }

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: `Your AECE Checkpoint Login Credentials`,
      MessageStream: "dev-stream",
      HtmlBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="background-color: #8B1A1A; padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">AECE Checkpoint</h1>
        <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.9;">Administrator Portal</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px;">
        <h2 style="color: #333333; margin: 0 0 20px 0;">Welcome, ${data.firstName}!</h2>
        <p style="color: #555555; line-height: 1.6; margin: 0 0 20px 0;">Your administrator account has been created. Below are your login credentials:</p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f8f8; border-radius: 6px; margin: 20px 0;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #666666; width: 120px;"><strong>Username:</strong></td>
                  <td style="padding: 8px 0; color: #333333;">${data.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; width: 120px;"><strong>Password:</strong></td>
                  <td style="padding: 8px 0; color: #333333; font-family: 'Courier New', Courier, monospace;">${data.password}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="color: #555555; line-height: 1.6; margin: 20px 0;">Access the AECE Checkpoint portal using the link below:</p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
          <tr>
            <td align="center">
              <a href="${data.siteUrl}" style="display: inline-block; background-color: #8B1A1A; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: bold;">Login to AECE Checkpoint</a>
            </td>
          </tr>
        </table>

        <p style="color: #555555; line-height: 1.6; margin: 20px 0;">Or copy and paste this link into your browser:</p>
        <p style="background-color: #f0f0f0; padding: 12px; border-radius: 4px; word-break: break-all; color: #0066cc; margin: 0;">
          <a href="${data.siteUrl}" style="color: #0066cc; text-decoration: underline;">${data.siteUrl}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;">

        <p style="color: #888888; font-size: 12px; line-height: 1.5; margin: 0;">
          <strong>Security Notice:</strong> Please change your password after your first login. Do not share your login credentials with anyone.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #333333; padding: 20px; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">AEC Electronics (Pty) Ltd - AECE Checkpoint</p>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      TextBody: `
AECE Checkpoint - Your Login Credentials

Welcome, ${data.firstName}!

Your administrator account has been created. Below are your login credentials:

Username: ${data.email}
Password: ${data.password}

Access the AECE Checkpoint portal at:
${data.siteUrl}

Please change your password after your first login. Do not share your login credentials with anyone.

---
AEC Electronics (Pty) Ltd - AECE Checkpoint
      `.trim(),
    });
    
    console.log('Admin credentials email sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send admin credentials email:', error);
    return false;
  }
}

export interface PasswordResetEmailData {
  firstName: string;
  resetToken: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(
  toEmail: string,
  fromEmail: string,
  data: PasswordResetEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping password reset email');
    return false;
  }

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: `Password Reset Request - AECE Checkpoint`,
      MessageStream: "dev-stream",
      HtmlBody: `
        <h2>Password Reset Request</h2>
        <p>Hello ${data.firstName},</p>
        <p>We received a request to reset your password for your AECE Checkpoint administrator account.</p>
        
        <p style="margin: 30px 0;">
          <a href="${data.resetUrl}" style="background-color: #8B1A1A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
        </p>
        
        <p>If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>
        
        <p style="margin-top: 20px; color: #666; font-size: 12px;">This link will expire in 1 hour.</p>
        
        <p style="margin-top: 30px; color: #666; font-size: 12px;">This notification was automatically generated by AECE Checkpoint.</p>
      `,
      TextBody: `
Password Reset Request

Hello ${data.firstName},

We received a request to reset your password for your AECE Checkpoint administrator account.

Reset your password here: ${data.resetUrl}

If you did not request a password reset, you can safely ignore this email. Your password will not be changed.

This link will expire in 1 hour.

This notification was automatically generated by AECE Checkpoint.
      `.trim(),
    });
    
    console.log('Password reset email sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

export interface MissedClockOutEmailData {
  employeeName: string;
  firstName: string;
  employeeId: string;
  department?: string;
  clockInTime: string;
  clockInDate: string;
  autoClockOutTime: string;
}

export async function sendMissedClockOutNotification(
  employeeEmail: string,
  fromEmail: string,
  data: MissedClockOutEmailData
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) {
    console.log('Email client not available - skipping missed clock-out notification');
    return false;
  }

  try {
    const result = await emailClient.sendEmail({
      From: fromEmail,
      To: employeeEmail,
      Subject: `Missed Clock-Out Alert - ${data.clockInDate}`,
      MessageStream: "dev-stream",
      HtmlBody: `
        <h2>Missed Clock-Out Alert</h2>
        <p>Hello ${data.firstName},</p>
        <p>Our system detected that you did not clock out on <strong>${data.clockInDate}</strong>.</p>
        
        <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.employeeId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Department:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.department || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Clock-In Time:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.clockInTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Auto Clock-Out:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.autoClockOutTime}</td>
          </tr>
        </table>
        
        <p>Your attendance has been automatically adjusted. If this is incorrect, please contact your supervisor or HR department.</p>
        
        <p style="margin-top: 20px; color: #666; font-size: 12px;">Please remember to clock out at the end of each work day.</p>
        
        <p style="margin-top: 30px; color: #666; font-size: 12px;">This notification was automatically generated by AECE Checkpoint.</p>
      `,
      TextBody: `
Missed Clock-Out Alert

Hello ${data.firstName},

Our system detected that you did not clock out on ${data.clockInDate}.

Employee: ${data.employeeName}
Employee ID: ${data.employeeId}
Department: ${data.department || 'N/A'}
Clock-In Time: ${data.clockInTime}
Auto Clock-Out: ${data.autoClockOutTime}

Your attendance has been automatically adjusted. If this is incorrect, please contact your supervisor or HR department.

Please remember to clock out at the end of each work day.

This notification was automatically generated by AECE Checkpoint.
      `.trim(),
    });
    
    console.log('Missed clock-out notification sent:', result.MessageID);
    return true;
  } catch (error) {
    console.error('Failed to send missed clock-out notification:', error);
    return false;
  }
}

// ── Manager missed clock-out alert ──────────────────────────────────────────

export async function sendManagerMissedClockOutAlert(
  managerEmail: string,
  fromEmail: string,
  data: { managerName: string; employeeName: string; employeeId: string; department?: string; clockInDate: string }
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) return false;
  try {
    await emailClient.sendEmail({
      From: fromEmail,
      To: managerEmail,
      Subject: `Staff Alert: Missed Clock-Out – ${data.employeeName} (${data.clockInDate})`,
      MessageStream: "dev-stream",
      HtmlBody: `<h2>Missed Clock-Out Alert</h2>
<p>Dear ${data.managerName},</p>
<p>This is an automated notice that <strong>${data.employeeName}</strong> (${data.employeeId}${data.department ? ', ' + data.department : ''}) did not clock out on <strong>${data.clockInDate}</strong>. Their attendance record has been auto-adjusted.</p>
<p>Please follow up if required.</p>
<p style="color:#666;font-size:12px;">AECE Checkpoint — automated notification</p>`,
      TextBody: `Missed Clock-Out Alert\n\nDear ${data.managerName},\n\n${data.employeeName} (${data.employeeId}) did not clock out on ${data.clockInDate}. Their record was auto-adjusted.\n\nPlease follow up if required.\n\nAECE Checkpoint`,
    });
    return true;
  } catch (e) { console.error('sendManagerMissedClockOutAlert error:', e); return false; }
}

// ── Leave stage change notification ────────────────────────────────────────

export async function sendLeaveStageNotification(
  recipientEmail: string,
  fromEmail: string,
  data: { recipientName: string; employeeName: string; leaveType: string; startDate: string; endDate: string; newStage: string; decision?: string; notes?: string }
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) return false;
  const stageLabel: Record<string, string> = {
    pending_hr: 'awaiting HR review',
    pending_md: 'awaiting MD approval',
    rejected: 'has been rejected',
    approved: 'has been approved',
  };
  const label = stageLabel[data.newStage] || data.newStage;
  const isAction = ['rejected', 'approved'].includes(data.newStage);
  try {
    await emailClient.sendEmail({
      From: fromEmail,
      To: recipientEmail,
      Subject: `Leave Request Update – ${data.employeeName} (${data.leaveType})`,
      MessageStream: "dev-stream",
      HtmlBody: `<h2>Leave Request ${isAction ? 'Decision' : 'Update'}</h2>
<p>Dear ${data.recipientName},</p>
<p>The leave request for <strong>${data.employeeName}</strong> (${data.leaveType}, ${data.startDate} – ${data.endDate}) is now <strong>${label}</strong>.</p>
${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
<p>Please log in to AECE Checkpoint to review or take action.</p>
<p style="color:#666;font-size:12px;">AECE Checkpoint — automated notification</p>`,
      TextBody: `Leave Request Update\n\nDear ${data.recipientName},\n\nLeave request for ${data.employeeName} (${data.leaveType}, ${data.startDate} – ${data.endDate}) is now ${label}.\n${data.notes ? 'Notes: ' + data.notes + '\n' : ''}\nLog in to AECE Checkpoint to review.\n\nAECE Checkpoint`,
    });
    return true;
  } catch (e) { console.error('sendLeaveStageNotification error:', e); return false; }
}

// ── Leave escalation reminder ───────────────────────────────────────────────

export async function sendLeaveEscalationReminder(
  managerEmail: string,
  fromEmail: string,
  data: { managerName: string; employeeName: string; leaveType: string; startDate: string; endDate: string; daysPending: number; requestId: number }
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) return false;
  try {
    await emailClient.sendEmail({
      From: fromEmail,
      To: managerEmail,
      Subject: `Reminder: Leave Request Awaiting Your Approval (${data.daysPending} days)`,
      MessageStream: "dev-stream",
      HtmlBody: `<h2>Leave Request Reminder</h2>
<p>Dear ${data.managerName},</p>
<p>A leave request from <strong>${data.employeeName}</strong> has been waiting for your approval for <strong>${data.daysPending} day(s)</strong>.</p>
<table style="border-collapse:collapse;width:100%;max-width:500px;margin:16px 0">
  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Employee</strong></td><td style="padding:8px;border:1px solid #ddd">${data.employeeName}</td></tr>
  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Leave Type</strong></td><td style="padding:8px;border:1px solid #ddd">${data.leaveType}</td></tr>
  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Period</strong></td><td style="padding:8px;border:1px solid #ddd">${data.startDate} – ${data.endDate}</td></tr>
</table>
<p>Please log in to AECE Checkpoint and action this request at your earliest convenience.</p>
<p style="color:#666;font-size:12px;">AECE Checkpoint — automated escalation</p>`,
      TextBody: `Leave Request Reminder\n\nDear ${data.managerName},\n\nA leave request from ${data.employeeName} (${data.leaveType}, ${data.startDate}–${data.endDate}) has been waiting ${data.daysPending} day(s) for your approval.\n\nPlease log in to AECE Checkpoint to action this request.\n\nAECE Checkpoint`,
    });
    return true;
  } catch (e) { console.error('sendLeaveEscalationReminder error:', e); return false; }
}

// ── AWOL alert ─────────────────────────────────────────────────────────────

export async function sendAWOLAlert(
  managerEmail: string,
  fromEmail: string,
  data: { managerName: string; awolEmployees: { name: string; id: string; department?: string }[]; date: string }
): Promise<boolean> {
  const emailClient = getClient();
  if (!emailClient) return false;
  const rows = data.awolEmployees.map(e =>
    `<tr><td style="padding:6px;border:1px solid #ddd">${e.id}</td><td style="padding:6px;border:1px solid #ddd">${e.name}</td><td style="padding:6px;border:1px solid #ddd">${e.department || '—'}</td></tr>`
  ).join('');
  try {
    await emailClient.sendEmail({
      From: fromEmail,
      To: managerEmail,
      Subject: `AWOL Alert – ${data.awolEmployees.length} Employee(s) Absent Without Leave (${data.date})`,
      MessageStream: "dev-stream",
      HtmlBody: `<h2>AWOL Alert</h2>
<p>Dear ${data.managerName},</p>
<p>The following employee(s) were absent without approved leave or a recorded clock-in on <strong>${data.date}</strong>:</p>
<table style="border-collapse:collapse;width:100%;max-width:600px;margin:16px 0">
  <thead><tr style="background:#1e293b;color:#fff"><th style="padding:8px;text-align:left">EMP ID</th><th style="padding:8px;text-align:left">Name</th><th style="padding:8px;text-align:left">Department</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p>Please follow up with these employees or log the relevant absence in AECE Checkpoint.</p>
<p style="color:#666;font-size:12px;">AECE Checkpoint — automated AWOL detection</p>`,
      TextBody: `AWOL Alert – ${data.date}\n\nDear ${data.managerName},\n\nThe following employees were absent without approved leave:\n\n${data.awolEmployees.map(e => `- ${e.name} (${e.id})`).join('\n')}\n\nPlease follow up.\n\nAECE Checkpoint`,
    });
    return true;
  } catch (e) { console.error('sendAWOLAlert error:', e); return false; }
}
