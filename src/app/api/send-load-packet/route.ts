import { NextResponse } from 'next/server';
import nodemailer, { type Transporter } from 'nodemailer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      to,
      subject,
      body: emailText,
      html,
      pdfBase64,
      fileName = 'Load_Packet.pdf',
      loadNumber,
      carrierName,
    } = body;

    // Validation
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return NextResponse.json(
        { error: 'A valid recipient email address is required.' },
        { status: 400 }
      );
    }

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json(
        { error: 'Email subject is required.' },
        { status: 400 }
      );
    }

    // Determine sender address
    const fromAddress =
      process.env.SMTP_FROM ||
      process.env.EMAIL_FROM ||
      `"${carrierName || 'PayloadLogic'}" <billing@payloadlogic.app>`;

    // Configure transporter
    // Supports standard SMTP environment variables:
    // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
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
      // SendGrid SMTP Relay standard
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    } else if (process.env.RESEND_API_KEY) {
      // Resend SMTP standard
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
      // Fallback: Create Ethereal test account or local development mock transport
      // In development / demo mode when third-party SMTP secrets are not yet plugged into .env,
      // this ensures the API does not crash and provides an instant preview URL.
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
        // Stream / JSON mock transport as ultra-safe fallback
        transporter = nodemailer.createTransport({
          streamTransport: true,
          newline: 'windows',
        });
      }
    }

    // Attachments
    const attachments: any[] = [];
    if (pdfBase64) {
      // Clean base64 prefix if present (e.g. data:application/pdf;base64,...)
      const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, '');
      attachments.push({
        filename: fileName,
        content: Buffer.from(cleanBase64, 'base64'),
        contentType: 'application/pdf',
      });
    }

    // Build plain text and HTML representation
    const formattedHtml =
      html ||
      `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <div style="padding: 16px; background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #1e3a8a;">${carrierName || 'Freight Logistics'}</h2>
          <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Official Load Billing &amp; Proof of Delivery Packet</p>
        </div>
        <div style="white-space: pre-wrap; font-size: 14px; margin-bottom: 24px;">
${emailText}
        </div>
        <div style="padding: 12px; background-color: #eff6ff; border-radius: 6px; font-size: 12px; color: #1d4ed8;">
          <strong>Attachment:</strong> ${fileName} contains the unified Freight Invoice and verified Proof of Delivery (BOL).
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 11px; color: #94a3b8;">
          Sent electronically via PayloadLogic Smart Logistics Engine. Please remit payment in accordance with invoice terms.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: emailText,
      html: formattedHtml,
      attachments,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
      recipient: to,
      attachmentsCount: attachments.length,
    });
  } catch (error: any) {
    console.error('Error dispatching load packet email:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to dispatch email to recipient.',
      },
      { status: 500 }
    );
  }
}
