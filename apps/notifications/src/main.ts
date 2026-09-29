import { NestFactory } from '@nestjs/core';
import { NotificationsModule } from './notifications.module';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NOTIFICATIONS_SERVICE } from '@app/common';
async function bootstrap() {
  const app = await NestFactory.create(NotificationsModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('RABBITMQ_URI')],
      noAck: false,
      queue: NOTIFICATIONS_SERVICE,
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  await app.listen(configService.getOrThrow<number>('PORT'));
}
bootstrap();