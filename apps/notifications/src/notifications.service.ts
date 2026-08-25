import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { NotifyEmailDto } from './dto/notify-email.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly fromEmail: string;
  private readonly fromName = 'Sleepr';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.fromEmail = this.configService.getOrThrow<string>('SMTP_USER');
  }

  async notifyEmail({ email, subject, text, html }: NotifyEmailDto) {
    try {
      const { data, status } = await firstValueFrom(
        this.httpService.post('/smtp/email', {
          sender: { email: this.fromEmail, name: this.fromName },
          to: [{ email }],
          subject,
          textContent: text,
          htmlContent: html ?? this.defaultTemplate(subject, text),
          tags: ['transactional'],
        }),
      );

      this.logger.log(`Email sent to ${email} — messageId: ${data?.messageId} status: ${status}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${email}`,
        error?.response?.data ?? error.message,
      );
      throw error;
    }
  }

  private defaultTemplate(subject: string, text: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background-color: #4f46e5; padding: 24px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; }
            .body { padding: 32px; color: #333333; font-size: 16px; line-height: 1.6; }
            .footer { background-color: #f4f4f4; text-align: center; padding: 16px; font-size: 12px; color: #999999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Sleepr</h1></div>
            <div class="body">
              <h2>${subject}</h2>
              <p>${text}</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Sleepr. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}