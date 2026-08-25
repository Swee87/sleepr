import { NestFactory } from '@nestjs/core';
import { PaymentsModule } from './payments.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';

async function bootstrap() {
  // Creates a hybrid app (HTTP + TCP microservice)
  const app = await NestFactory.create(PaymentsModule);
  const configService = app.get(ConfigService);

  // ─── Raw body for webhook signature verification ──────────────
  // Must be registered BEFORE global json parser
  // Paystack signature uses the raw body — if parsed first it breaks
  app.use(
    '/payments/webhook',
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf; // attach raw buffer to request
      },
    }),
  );

  // ─── TCP Microservice (for inter-service communication) ───────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: configService.get<number>('TCP_PORT'), // separate port for TCP
    },
  });

  // ─── Global pipes ─────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,      // strip unknown fields
      forbidNonWhitelisted: true, // throw on unknown fields
      transform: true,      // auto transform types (string → number etc)
    }),
  );

  // ─── Logger ───────────────────────────────────────────────────
  app.useLogger(app.get(Logger));

  // ─── Start both HTTP and TCP ──────────────────────────────────
  await app.startAllMicroservices();
  
  const port = configService.get<number>('PORT') || 3003;
  const tcpPort = configService.get<number>('TCP_PORT');
  
  await app.listen(port); // HTTP for webhook

  console.log(`Payments HTTP running on port ${port}`);
  console.log(`Payments TCP running on port ${tcpPort}`);
}
bootstrap();


// import { NestFactory } from '@nestjs/core';
// import { PaymentsModule } from './payments.module';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
// import { ConfigService } from '@nestjs/config';
// import { Logger } from 'nestjs-pino';

// async function bootstrap() {
//   const app = await NestFactory.create(PaymentsModule);
//   const configService = app.get(ConfigService);
//   app.connectMicroservice<MicroserviceOptions>({
//     transport: Transport.TCP,
//     options: {
//       host: '0.0.0.0',
//       port: configService.get('PORT'),
//     },
//   });
//   app.useLogger(app.get(Logger));
//   await app.startAllMicroservices();
// }
// bootstrap();
