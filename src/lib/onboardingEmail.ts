import nodemailer, { type Transporter } from 'nodemailer';

interface SendOnboardingEmailParams {
  recipientEmail: string;
  driverName: string;
  companyName: string;
  onboardingLink: string;
}

export async function sendOnboardingInviteEmail({
  recipientEmail,
  driverName,
  companyName,
  onboardingLink,
}: SendOnboardingEmailParams): Promise<{ success: boolean; previewUrl?: string; messageId?: string }> {
  try {
    let transporter: Transporter;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else if (process.env.SENDGRID_API_KEY) {
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    } else if (process.env.RESEND_API_KEY) {
      transporter = nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      });
    } else {
      // Development / test fallback
      const testAccount = await nodemailer.createTestAccount().catch(() => null);
      if (testAccount) {
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      } else {
        transporter = nodemailer.createTransport({
          streamTransport: true,
          newline: 'windows',
        });
      }
    }

    const senderEmail =
      process.env.SMTP_FROM ||
      process.env.EMAIL_FROM ||
      `"${companyName || 'PayloadLogic'}" <notifications@payloadlogic.app>`;

    const subject = `You've been invited to complete your driver profile for ${companyName || 'PayloadLogic'}`;

    const textContent = `Hello ${driverName},\n\nYou’ve been invited to complete your driver profile for ${companyName || 'PayloadLogic'}. Click the link to enter your information:\n\n${onboardingLink}\n\nThis link is secure, single-use, and valid for 7 days.\n\nThank you,\n${companyName || 'PayloadLogic'}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 560px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header -->
    <div style="background-color: #0f172a; padding: 24px; text-align: center;">
      <h1 style="color: #38bdf8; font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">PayloadLogic</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Driver Self-Onboarding</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 24px;">
      <p style="font-size: 16px; margin: 0 0 16px 0; color: #334155;">Hello <strong>${driverName}</strong>,</p>
      
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; color: #475569;">
        You’ve been invited to complete your driver profile for <strong>${companyName || 'PayloadLogic'}</strong>. Click the link to enter your information.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${onboardingLink}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);">
          Complete Driver Profile &rarr;
        </a>
      </div>

      <!-- Notice Box -->
      <div style="background-color: #f1f5f9; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
          <strong>No login required.</strong> This single-use link is securely tied to your profile and is valid for <strong>7 days</strong>.
        </p>
      </div>

      <p style="font-size: 12px; color: #64748b; word-break: break-all; margin: 0 0 8px 0;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 12px; font-family: monospace; color: #0284c7; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; word-break: break-all; margin: 0;">
        ${onboardingLink}
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
        Sent on behalf of ${companyName || 'PayloadLogic'} via PayloadLogic Fleet Management.
      </p>
    </div>

  </div>
</body>
</html>
    `;

    const info = await transporter.sendMail({
      from: senderEmail,
      to: recipientEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
    };
  } catch (err: any) {
    console.error('Failed to send onboarding invite email:', err);
    return {
      success: false,
    };
  }
}

export interface SendDriverCredentialsEmailParams {
  recipientEmail: string;
  driverName: string;
  companyName: string;
  driverPortalUrl: string;
  loginUrl: string;
  loginEmail: string;
  tempPassword: string;
  passwordResetLink?: string;
}

export async function sendDriverCredentialsEmail({
  recipientEmail,
  driverName,
  companyName,
  driverPortalUrl,
  loginUrl,
  loginEmail,
  tempPassword,
}: SendDriverCredentialsEmailParams): Promise<{ success: boolean; previewUrl?: string; messageId?: string }> {
  try {
    let transporter: Transporter;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else if (process.env.SENDGRID_API_KEY) {
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    } else if (process.env.RESEND_API_KEY) {
      transporter = nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      });
    } else {
      const testAccount = await nodemailer.createTestAccount().catch(() => null);
      if (testAccount) {
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      } else {
        transporter = nodemailer.createTransport({
          streamTransport: true,
          newline: 'windows',
        });
      }
    }

    const senderEmail =
      process.env.SMTP_FROM ||
      process.env.EMAIL_FROM ||
      `"${companyName || 'PayloadLogic'}" <notifications@payloadlogic.app>`;

    const subject = `Your PayloadLogic Driver View Login & Access Link — ${companyName || 'PayloadLogic'}`;

    const textContent = `Hello ${driverName},\n\nYour limited Driver View account for ${companyName || 'PayloadLogic'} is ready!\n\n1. Instant Magic Link (One-Tap Driver View):\n${driverPortalUrl}\n\n2. Standard Sign-In Credentials:\nLogin URL: ${loginUrl}\nEmail: ${loginEmail}\nTemporary Password: ${tempPassword}\n\nIn Driver View, you can view your profile, see loads assigned to you, accept or decline dispatches, and update load status, phases, and notes.\n\nThank you,\n${companyName || 'PayloadLogic'}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 560px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background-color: #0f172a; padding: 24px; text-align: center;">
      <h1 style="color: #fbbf24; font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">PayloadLogic</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Driver View Access Ready</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="font-size: 16px; margin: 0 0 16px 0; color: #334155;">Hello <strong>${driverName}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; color: #475569;">
        Your Driver View account for <strong>${companyName || 'PayloadLogic'}</strong> has been created. You can open your Driver View immediately using the magic link below, or sign in with your credentials.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${driverPortalUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Open My Driver View &rarr;
        </a>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b;">Sign-In Credentials (${loginUrl})</p>
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #1e293b;"><strong>Email / Username:</strong> <span style="font-family: monospace;">${loginEmail}</span></p>
        <p style="margin: 0; font-size: 14px; color: #1e293b;"><strong>Temporary Password:</strong> <span style="font-family: monospace; background: #fef3c7; padding: 2px 6px; border-radius: 4px;">${tempPassword}</span></p>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
        Your Driver View gives you access to your driver profile and loads assigned to you so you can accept/decline dispatches and update load status, phases, and notes.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const info = await transporter.sendMail({
      from: senderEmail,
      to: recipientEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
    };
  } catch (err: any) {
    console.error('Failed to send driver credentials email:', err);
    return {
      success: false,
    };
  }
}
