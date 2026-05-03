import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

/**
 * EmailService — Sends password reset emails with secure tokens.
 *
 * Production: Uses RESEND via nodemailer SMTP.
 * Local dev: Uses ethereal (demo inbox) if RESEND_API_KEY not configured.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  // transporter may be undefined when email delivery is not configured (local/dev)
  private transporter: nodemailer.Transporter | undefined = undefined;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    if (process.env.RESEND_API_KEY) {
      // Production: Resend
      // nodemailer.createTransport returns a value typed as any in some versions;
      // cast to Transporter to satisfy TypeScript while keeping runtime behavior.

      // createTransport may be typed as `any` by some nodemailer versions; assert once and silence the specific ESLint rule here.

      this.transporter = nodemailer.createTransport({
        host: 'smtp.RESEND.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: process.env.RESEND_API_KEY,
        },
      }) as unknown as nodemailer.Transporter;
      this.logger.log('✅ RESEND SMTP configured for production');
    } else {
      // Local dev: Ethereal (demo/testing only)
      this.logger.warn(
        '⚠️  RESEND_API_KEY not configured. Using Ethereal (demo mode). Password reset emails will NOT be sent.',
      );
      // leave transporter undefined so sendPasswordResetEmail can detect missing config
    }
  }

  /**
   * Send password reset email with secure link.
   * @param toEmail - Recipient email
   * @param resetToken - Base64-encoded or hashed token (send via link, not inline)
   * @param resetLink - Full HTTPS link to password reset page (e.g., https://app.innova.io/auth/reset?token=...)
   */
  async sendPasswordResetEmail(
    toEmail: string,
    resetLink: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.transporter) {
      this.logger.warn(
        `⚠️  Email service not configured. In production, password reset email would be sent to ${toEmail}`,
      );
      return {
        success: false,
        error:
          'Email service not configured. Configure RESEND_API_KEY to enable password resets.',
      };
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: process.env.EMAIL_FROM || 'innova.grupo23@gmail.com',
        to: toEmail,
        subject: 'Recupera tu contraseña — SuperProfes',
        html: this.buildPasswordResetEmailHTML(resetLink),
        text: this.buildPasswordResetEmailText(resetLink),
      };

      const result: nodemailer.SentMessageInfo =
        (await this.transporter.sendMail(
          mailOptions,
        )) as unknown as nodemailer.SentMessageInfo;
      this.logger.log(`✅ Password reset email sent to ${toEmail}`);
      const messageId =
        typeof result.messageId !== 'undefined'
          ? String(result.messageId)
          : undefined;
      return { success: true, messageId };
    } catch (error) {
      this.logger.error(
        `❌ Failed to send password reset email to ${toEmail}:`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build HTML email template with branding.
   */
  private buildPasswordResetEmailHTML(resetLink: string): string {
    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0; }
      .logo { font-size: 24px; font-weight: bold; color: #1e40af; }
      .content { padding: 30px 0; }
      .button { display: inline-block; padding: 12px 30px; background-color: #1e40af; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
      .footer { text-align: center; font-size: 12px; color: #999; border-top: 1px solid #f0f0f0; padding-top: 20px; margin-top: 30px; }
      .warning { background-color: #fef3c7; padding: 12px; border-radius: 6px; color: #92400e; font-size: 12px; margin: 20px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">SuperProfes</div>
      </div>
      
      <div class="content">
        <h2>Recupera tu contraseña</h2>
        
        <p>Recibimos una solicitud para resetear tu contraseña. Haz clic en el botón de abajo para establecer una nueva contraseña:</p>
        
        <a href="${resetLink}" class="button">Resetear Contraseña</a>
        
        <p>Este enlace es válido por <strong>15 minutos</strong>.</p>
        
        <div class="warning">
          <strong>⚠️ Seguridad:</strong> Si no solicitaste un reset de contraseña, ignora este email. Tu cuenta seguirá segura.
        </div>
        
        <p style="font-size: 12px; color: #999;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <code style="word-break: break-all;">${resetLink}</code>
        </p>
      </div>
      
      <div class="footer">
        <p>© 2026 SuperProfes. Educación matemática adaptativa.</p>
        <p><a href="https://superprofes.app" style="color: #1e40af; text-decoration: none;">superprofes.app</a></p>
      </div>
    </div>
  </body>
</html>
    `;
  }

  /**
   * Build plain text email (fallback for clients without HTML support).
   */
  private buildPasswordResetEmailText(resetLink: string): string {
    return `
Hola,

Recibimos una solicitud para resetear tu contraseña. Copia y pega el siguiente enlace en tu navegador para establecer una nueva contraseña:

${resetLink}

Este enlace es válido por 15 minutos.

Seguridad: Si no solicitaste un reset de contraseña, ignora este email. Tu cuenta seguirá segura.

---
© 2026 SuperProfes
Educación matemática adaptativa
    `;
  }
}
