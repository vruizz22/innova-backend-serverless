import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * EmailService — Sends password reset emails with secure tokens.
 *
 * Production: Uses the Resend API.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resendClient: Resend | undefined = undefined;
  private fromEmail: string | undefined = undefined;

  constructor(private readonly configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !fromEmail) {
      throw new Error(
        'RESEND_API_KEY and RESEND_FROM_EMAIL are required in production',
      );
    }

    this.resendClient = new Resend(apiKey);
    this.fromEmail = fromEmail;
    this.logger.log('✅ Resend API configured for email delivery');
  }

  async sendPasswordResetEmail(
    toEmail: string,
    resetLink: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.resendClient || !this.fromEmail) {
      return {
        success: false,
        error:
          'Email service not configured. Configure RESEND_API_KEY and RESEND_FROM_EMAIL to enable password resets.',
      };
    }

    try {
      const { data, error } = await this.resendClient.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject: 'Recupera tu contraseña — SuperProfes',
        html: this.buildPasswordResetEmailHTML(resetLink),
        text: this.buildPasswordResetEmailText(resetLink),
      });

      if (error) {
        this.logger.error(
          `❌ Failed to send password reset email to ${toEmail}: ${error.message}`,
        );
        return { success: false, error: error.message };
      }

      this.logger.log(`✅ Password reset email sent to ${toEmail}`);
      return { success: true, messageId: data?.id };
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
    const resetOrigin = new URL(resetLink).origin;

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
        <p><a href="${resetOrigin}" style="color: #1e40af; text-decoration: none;">${resetOrigin}</a></p>
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
