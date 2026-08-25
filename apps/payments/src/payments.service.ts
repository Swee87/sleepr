// payments.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { PaymentsRepository } from './payments.repository';
import { PaymentStatus } from './schema/payment.schema';
import { RefundStatus } from './schema/refund.schema';
import { CreateChargeDto } from './dto/create-charge.dto';
import { PAYMENT_QUEUE, PaymentJob } from './queues/payment.queue';
import { ClientProxy } from '@nestjs/microservices';
import { NOTIFICATIONS_SERVICE } from '@app/common';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly paymentsRepository: PaymentsRepository,
    @InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue,
    @Inject(NOTIFICATIONS_SERVICE) private readonly notificationsService: ClientProxy,
  ) { }

  // ─── Initialize Payment ──────────────────────────────────────
  async initializePayment(dto: CreateChargeDto) {
    const idempotencyKey = `init-${dto.userId}-${dto.email}-${dto.amount}`;

    // 1. Idempotency check
    const existing = await this.paymentsRepository
      .findPaymentByIdempotencyKey(idempotencyKey);

    if (existing) {
      this.logger.warn(`Duplicate payment blocked: ${idempotencyKey}`);
      return {
        paymentId: existing.paymentId,
        paymentUrl: existing.paymentUrl,
        reference: existing.reference,
        amount: existing.amount,
      };
    }

    // 2. Generate IDs
    const reference = this.generateReference();
    const paymentId = this.generatePaymentId();

    // 3. Call Paystack
    let paystackData: any;
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/transaction/initialize', {
          email: dto.email,
          amount: Math.round(dto.amount * 100),
          reference,
          currency: dto.currency ?? 'NGN',
          channels: dto.channels ?? ['card', 'bank_transfer', 'ussd', 'bank'],
          metadata: {
            userId: dto.userId,
            paymentId,
          },
        }),
      );

      if (!data.status) {
        throw new BadRequestException(`Paystack error: ${data.message}`);
      }
      paystackData = data.data;
    } catch (error: any) {
      this.logger.error('Paystack initialization failed', error.message);
      throw new BadRequestException('Payment initialization failed');
    }

    // 4. Persist atomically to MongoDB
    const payment = await this.paymentsRepository.createPaymentAtomic({
      paymentId,
      userId: dto.userId,
      email: dto.email,
      amount: dto.amount,
      currency: dto.currency ?? 'NGN',
      reference,
      status: PaymentStatus.PENDING,
      paymentUrl: paystackData.authorization_url,
      accessCode: paystackData.access_code,
      idempotencyKey,
      gatewayResponse: paystackData,
    });

    // 5. Enqueue fallback verification (BullMQ syntax)
    await this.paymentQueue.add(
      PaymentJob.VERIFY_PAYMENT,
      { reference },
      {
        delay: 10 * 60 * 1000, // 10 minutes
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,           // 5s → 10s → 20s
        },
        removeOnComplete: true,
        removeOnFail: false,     // keep failed jobs for debugging
      },
    );

    this.logger.log(`Payment initialized: ${paymentId}`);
    this.notificationsService.emit('notify_email', {
      email: dto.email,
      subject: 'Payment Initialized',
      text: `Your payment of ₦${dto.amount} has been initialized.`,
    });
    console.log('Payment initialized:', paymentId);

    return {
      paymentId: payment.paymentId,
      paymentUrl: payment.paymentUrl,
      reference: payment.reference,
      amount: payment.amount,
    };
  }

  // ─── Verify Payment ──────────────────────────────────────────
  async verifyPayment(reference: string) {
    const payment = await this.paymentsRepository
      .findPaymentByReference(reference);

    if (!payment) throw new BadRequestException('Payment not found');

    // Already paid — return early
    if (payment.status === PaymentStatus.PAID) {
      return { status: PaymentStatus.PAID, paymentId: payment.paymentId };
    }

    // Acquire soft lock — prevents webhook + queue job racing
    const lockAcquired = await this.paymentsRepository
      .acquireProcessingLock(reference);

    if (!lockAcquired) {
      this.logger.warn(`Lock not acquired for ${reference} — skipping`);
      return { status: payment.status, paymentId: payment.paymentId };
    }

    try {
      // Always verify with Paystack — never trust DB alone
      const { data } = await firstValueFrom(
        this.httpService.get(`/transaction/verify/${reference}`),
      );

      if (!data.status) throw new BadRequestException('Verification failed');

      const txData = data.data;
      const newStatus = txData.status === 'success'
        ? PaymentStatus.PAID
        : PaymentStatus.FAILED;

      // Atomic update — only updates if still PENDING
      const updated = await this.paymentsRepository.updatePaymentStatusAtomic(
        reference,
        PaymentStatus.PENDING,
        newStatus,
        {
          channel: txData.channel,
          gatewayResponse: txData,
          paidAt: newStatus === PaymentStatus.PAID ? new Date() : undefined,
          failedAt: newStatus === PaymentStatus.FAILED ? new Date() : undefined,
        },
      );

      if (!updated) {
        this.logger.warn(`Payment ${reference} already updated by another process`);
        return { status: newStatus, paymentId: payment.paymentId };
      }

      // Notify user on successful payment
      if (newStatus === PaymentStatus.PAID) {
        this.notificationsService.emit('notify_email', {
          email: payment.email,
          subject: 'Payment Successful',
          text: `Your payment of ₦${payment.amount} has been confirmed.`,
        });
        console.log('Payment verified:', reference, '→', newStatus);
      }

      // Notify user on failed payment
      if (newStatus === PaymentStatus.FAILED) {
        this.notificationsService.emit('notify_email', {
          email: payment.email,
          subject: 'Payment Failed',
          text: `Your payment of ₦${payment.amount} could not be processed. Please try again.`,
        });
        console.log('Payment verified:', reference, '→', newStatus);
      }

      this.logger.log(`Payment verified: ${reference} → ${newStatus}`);

      return {
        status: newStatus,
        paymentId: payment.paymentId,
        amount: txData.amount / 100,
        channel: txData.channel,
      };
    } finally {
      // Always release lock — even if error occurs
      await this.paymentsRepository.releaseProcessingLock(reference);
    }
  }

  // ─── Webhook Handler (called by controller) ──────────────────
  // Just enqueues — returns fast so Paystack gets 200 quickly
  async handleWebhook(payload: any) {
    this.logger.log(`Webhook received: ${payload.event}`);

    await this.paymentQueue.add(
      PaymentJob.PROCESS_WEBHOOK,
      { payload },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { received: true };
  }

  // ─── Process Webhook Event (called by queue processor) ───────
  async processWebhookEvent(payload: any) {
    const event = payload.event;
    const eventData = payload.data;

    this.logger.log(`Processing webhook event: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.verifyPayment(eventData.reference);
        break;

      case 'charge.failed':
        await this.paymentsRepository.updatePaymentStatusAtomic(
          eventData.reference,
          PaymentStatus.PENDING,
          PaymentStatus.FAILED,
          { failedAt: new Date(), gatewayResponse: eventData },
        );
        break;

      case 'refund.processed':
        await this.paymentsRepository.updateRefundStatus(
          eventData.id,
          RefundStatus.COMPLETED,
          { completedAt: new Date(), gatewayResponse: eventData },
        );
        break;

      default:
        this.logger.log(`Unhandled webhook event: ${event}`);
    }
  }

  // ─── Initiate Refund ─────────────────────────────────────────
  async initiateRefund(reference: string, userId: string, amount?: number) {
    const payment = await this.paymentsRepository
      .findPaymentByReference(reference);

    if (!payment) throw new BadRequestException('Payment not found');
    if (payment.userId !== userId) throw new UnauthorizedException('Unauthorized');
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Only paid payments can be refunded');
    }

    // Check refundable balance
    const alreadyRefunded = await this.paymentsRepository
      .getTotalRefundedForPayment(payment.paymentId);

    const refundAmount = amount ?? payment.amount;
    const maxRefundable = payment.amount - alreadyRefunded;

    if (refundAmount > maxRefundable) {
      throw new BadRequestException(
        `Refund ₦${refundAmount} exceeds refundable balance ₦${maxRefundable}`,
      );
    }

    // Call Paystack
    const { data } = await firstValueFrom(
      this.httpService.post('/refund', {
        transaction: reference,
        amount: Math.round(refundAmount * 100),
      }),
    );

    if (!data.status) {
      throw new BadRequestException(`Refund failed: ${data.message}`);
    }

    // Save refund
    const refundId = this.generateRefundId();
    await this.paymentsRepository.createRefund({
      refundId,
      paymentId: payment.paymentId,
      userId,
      amount: refundAmount,
      status: RefundStatus.COMPLETED,
      providerRefundId: String(data.data.id),
      gatewayResponse: data.data,
      completedAt: new Date(),
    });

    // Update payment status atomically
    await this.paymentsRepository.updatePaymentStatusAtomic(
      reference,
      PaymentStatus.PAID,
      PaymentStatus.REFUNDED,
    );

    this.logger.log(`Refund processed: ${refundId}`);

    // Notify user on successful refund
    this.notificationsService.emit('notify_email', {
      email: payment.email,
      subject: 'Refund Successful',
      text: `Your refund of ₦${refundAmount} has been processed successfully.`,
    });
    console.log('Refund processed:', refundId);
    return { refundId, status: RefundStatus.COMPLETED, amount: refundAmount };
  }

  // ─── Helpers ──────────────────────────────────────────────────
  private generateReference(): string {
    return `PAY-${Date.now()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  }

  private generatePaymentId(): string {
    return `PMT-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
  }

  private generateRefundId(): string {
    return `RFD-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
  }
}



// // payments.service.ts
// import {
//   Injectable,
//   BadRequestException,
//   UnauthorizedException,
//   Logger,
// } from '@nestjs/common';
// import { HttpService } from '@nestjs/axios';
// import { ConfigService } from '@nestjs/config';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import { firstValueFrom } from 'rxjs';
// import * as crypto from 'crypto';
// import { PaymentsRepository } from './payments.repository';
// import { PaymentStatus } from './schema/payment.schema';
// import { RefundStatus } from './schema/refund.schema';
// import { CreateChargeDto } from './dto/create-charge.dto';
// import { PAYMENT_QUEUE, PaymentJob } from './queues/payment.queue';
// import { ClientProxy } from '@nestjs/microservices';
// import { NOTIFICATIONS_SERVICE } from '@app/common';
// import { Inject } from '@nestjs/common';

// @Injectable()
// export class PaymentsService {
//   private readonly logger = new Logger(PaymentsService.name);

//   constructor(
//     private readonly httpService: HttpService,
//     private readonly configService: ConfigService,
//     private readonly paymentsRepository: PaymentsRepository,
//     @InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue,
//     @Inject(NOTIFICATIONS_SERVICE) private readonly notificationsService: ClientProxy,
//   ) { }

//   // ─── Initialize Payment ──────────────────────────────────────
//   async initializePayment(dto: CreateChargeDto) {
//     const idempotencyKey = `init-${dto.userId}-${dto.email}-${dto.amount}`;

//     // 1. Idempotency check
//     const existing = await this.paymentsRepository
//       .findPaymentByIdempotencyKey(idempotencyKey);

//     if (existing) {
//       this.logger.warn(`Duplicate payment blocked: ${idempotencyKey}`);
//       return {
//         paymentId: existing.paymentId,
//         paymentUrl: existing.paymentUrl,
//         reference: existing.reference,
//         amount: existing.amount,
//       };
//     }

//     // 2. Generate IDs
//     const reference = this.generateReference();
//     const paymentId = this.generatePaymentId();

//     // 3. Call Paystack
//     let paystackData: any;
//     try {
//       const { data } = await firstValueFrom(
//         this.httpService.post('/transaction/initialize', {
//           email: dto.email,
//           amount: Math.round(dto.amount * 100),
//           reference,
//           currency: dto.currency ?? 'NGN',
//           channels: dto.channels ?? ['card', 'bank_transfer', 'ussd', 'bank'],
//           metadata: {
//             userId: dto.userId,
//             paymentId,
//           },
//         }),
//       );

//       if (!data.status) {
//         throw new BadRequestException(`Paystack error: ${data.message}`);
//       }
//       paystackData = data.data;
//     } catch (error: any) {
//       this.logger.error('Paystack initialization failed', error.message);
//       throw new BadRequestException('Payment initialization failed');
//     }

//     // 4. Persist atomically to MongoDB
//     const payment = await this.paymentsRepository.createPaymentAtomic({
//       paymentId,
//       userId: dto.userId,
//       email: dto.email,
//       amount: dto.amount,
//       currency: dto.currency ?? 'NGN',
//       reference,
//       status: PaymentStatus.PENDING,
//       paymentUrl: paystackData.authorization_url,
//       accessCode: paystackData.access_code,
//       idempotencyKey,
//       gatewayResponse: paystackData,
//     });

//     // 5. Enqueue fallback verification (BullMQ syntax)
//     await this.paymentQueue.add(
//       PaymentJob.VERIFY_PAYMENT,
//       { reference },
//       {
//         delay: 10 * 60 * 1000, // 10 minutes
//         attempts: 3,
//         backoff: {
//           type: 'exponential',
//           delay: 5000,           // 5s → 10s → 20s
//         },
//         removeOnComplete: true,
//         removeOnFail: false,     // keep failed jobs for debugging
//       },
//     );

//     this.logger.log(`Payment initialized: ${paymentId}`);

//     return {
//       paymentId: payment.paymentId,
//       paymentUrl: payment.paymentUrl,
//       reference: payment.reference,
//       amount: payment.amount,
//     };
//   }

//   // ─── Verify Payment ──────────────────────────────────────────
//   async verifyPayment(reference: string) {
//     const payment = await this.paymentsRepository
//       .findPaymentByReference(reference);

//     if (!payment) throw new BadRequestException('Payment not found');

//     // Already paid — return early
//     if (payment.status === PaymentStatus.PAID) {
//       return { status: PaymentStatus.PAID, paymentId: payment.paymentId };
//     }

//     // Acquire soft lock — prevents webhook + queue job racing
//     const lockAcquired = await this.paymentsRepository
//       .acquireProcessingLock(reference);

//     if (!lockAcquired) {
//       this.logger.warn(`Lock not acquired for ${reference} — skipping`);
//       return { status: payment.status, paymentId: payment.paymentId };
//     }

//     try {
//       // Always verify with Paystack — never trust DB alone
//       const { data } = await firstValueFrom(
//         this.httpService.get(`/transaction/verify/${reference}`),
//       );

//       if (!data.status) throw new BadRequestException('Verification failed');

//       const txData = data.data;
//       const newStatus = txData.status === 'success'
//         ? PaymentStatus.PAID
//         : PaymentStatus.FAILED;

//       // Atomic update — only updates if still PENDING
//       const updated = await this.paymentsRepository.updatePaymentStatusAtomic(
//         reference,
//         PaymentStatus.PENDING,
//         newStatus,
//         {
//           channel: txData.channel,
//           gatewayResponse: txData,
//           paidAt: newStatus === PaymentStatus.PAID ? new Date() : undefined,
//           failedAt: newStatus === PaymentStatus.FAILED ? new Date() : undefined,
//         },
//       );

//       if (!updated) {
//         this.logger.warn(`Payment ${reference} already updated by another process`);
//         return { status: newStatus, paymentId: payment.paymentId };
//       }

//       this.logger.log(`Payment verified: ${reference} → ${newStatus}`);

//       return {
//         status: newStatus,
//         paymentId: payment.paymentId,
//         amount: txData.amount / 100,
//         channel: txData.channel,
//       };
//     } finally {
//       // Always release lock — even if error occurs
//       await this.paymentsRepository.releaseProcessingLock(reference);
//     }
//   }

//   // ─── Webhook Handler (called by controller) ──────────────────
//   // Just enqueues — returns fast so Paystack gets 200 quickly
//   async handleWebhook(payload: any) {
//     this.logger.log(`Webhook received: ${payload.event}`);

//     await this.paymentQueue.add(
//       PaymentJob.PROCESS_WEBHOOK,
//       { payload },
//       {
//         attempts: 5,
//         backoff: { type: 'exponential', delay: 2000 },
//         removeOnComplete: true,
//         removeOnFail: false,
//       },
//     );

//     return { received: true };
//   }

//   // ─── Process Webhook Event (called by queue processor) ───────
//   async processWebhookEvent(payload: any) {
//     const event = payload.event;
//     const eventData = payload.data;

//     this.logger.log(`Processing webhook event: ${event}`);

//     switch (event) {
//       case 'charge.success':
//         await this.verifyPayment(eventData.reference);
//         break;

//       case 'charge.failed':
//         await this.paymentsRepository.updatePaymentStatusAtomic(
//           eventData.reference,
//           PaymentStatus.PENDING,
//           PaymentStatus.FAILED,
//           { failedAt: new Date(), gatewayResponse: eventData },
//         );
//         break;

//       case 'refund.processed':
//         await this.paymentsRepository.updateRefundStatus(
//           eventData.id,
//           RefundStatus.COMPLETED,
//           { completedAt: new Date(), gatewayResponse: eventData },
//         );
//         break;

//       default:
//         this.logger.log(`Unhandled webhook event: ${event}`);
//     }
//   }

//   // ─── Initiate Refund ─────────────────────────────────────────
//   async initiateRefund(reference: string, userId: string, amount?: number) {
//     const payment = await this.paymentsRepository
//       .findPaymentByReference(reference);

//     if (!payment) throw new BadRequestException('Payment not found');
//     if (payment.userId !== userId) throw new UnauthorizedException('Unauthorized');
//     if (payment.status !== PaymentStatus.PAID) {
//       throw new BadRequestException('Only paid payments can be refunded');
//     }

//     // Check refundable balance
//     const alreadyRefunded = await this.paymentsRepository
//       .getTotalRefundedForPayment(payment.paymentId);

//     const refundAmount = amount ?? payment.amount;
//     const maxRefundable = payment.amount - alreadyRefunded;

//     if (refundAmount > maxRefundable) {
//       throw new BadRequestException(
//         `Refund ₦${refundAmount} exceeds refundable balance ₦${maxRefundable}`,
//       );
//     }

//     // Call Paystack
//     const { data } = await firstValueFrom(
//       this.httpService.post('/refund', {
//         transaction: reference,
//         amount: Math.round(refundAmount * 100),
//       }),
//     );

//     if (!data.status) {
//       throw new BadRequestException(`Refund failed: ${data.message}`);
//     }

//     // Save refund
//     const refundId = this.generateRefundId();
//     await this.paymentsRepository.createRefund({
//       refundId,
//       paymentId: payment.paymentId,
//       userId,
//       amount: refundAmount,
//       status: RefundStatus.COMPLETED,
//       providerRefundId: String(data.data.id),
//       gatewayResponse: data.data,
//       completedAt: new Date(),
//     });

//     // Update payment status atomically
//     await this.paymentsRepository.updatePaymentStatusAtomic(
//       reference,
//       PaymentStatus.PAID,
//       PaymentStatus.REFUNDED,
//     );

//     this.logger.log(`Refund processed: ${refundId}`);

//     return { refundId, status: RefundStatus.COMPLETED, amount: refundAmount };
//   }

//   // ─── Helpers ──────────────────────────────────────────────────
//   private generateReference(): string {
//     return `PAY-${Date.now()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
//   }

//   private generatePaymentId(): string {
//     return `PMT-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
//   }

//   private generateRefundId(): string {
//     return `RFD-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
//   }
// }