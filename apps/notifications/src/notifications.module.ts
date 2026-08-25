import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule, HealthModule } from '@app/common';
import { HttpModule } from '@nestjs/axios';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
        TCP_PORT: Joi.number().required(),
        SMTP_USER: Joi.string().required(),
        BREVO_API_KEY: Joi.string().required(),
      }),
    }),
    HttpModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        baseURL: 'https://api.brevo.com/v3',
        timeout: 10_000,
        headers: {
          'api-key': configService.getOrThrow<string>('BREVO_API_KEY'),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }),
      inject: [ConfigService],
    }),
    LoggerModule,
    HealthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule { }