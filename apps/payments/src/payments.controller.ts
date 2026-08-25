// payments.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  Get,
  Param,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PaymentsService } from './payments.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { PAYMENT_QUEUE, PaymentJob } from './queues/payment.queue';

// ─── TCP Message Patterns ─────────────────────────────────────
// No @Controller prefix for TCP routes
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue,
  ) { }

  // ─── TCP: reservations → payments ──────────────────────────
  @MessagePattern('create_charge')
  async createCharge(@Payload() dto: CreateChargeDto) {
    console.log('create_charge received:', dto);
    return this.paymentsService.initializePayment(dto);
  }

  @MessagePattern('verify_payment')
  async verifyPayment(@Payload() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(dto.reference);
  }

  @MessagePattern('initiate_refund')
  async initiateRefund(@Payload() dto: RefundPaymentDto) {
    await this.paymentQueue.add(
      PaymentJob.PROCESS_REFUND,
      {
        reference: dto.reference,
        userId: dto.userId,
        amount: dto.amount,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return { message: 'Refund queued', reference: dto.reference };
  }

  // ─── HTTP: Paystack webhook ───────────────────────────────
  @Post('webhook')
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  async handleWebhook(@Body() body: any) {
    return this.paymentsService.handleWebhook(body);
  }

  // ─── HTTP: manual verify (dev only) ──────────────────────
  @Post('verify/:reference')
  async manualVerify(@Param('reference') reference: string) {
    await this.paymentQueue.add(
      PaymentJob.VERIFY_PAYMENT,
      { reference },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return { message: 'Verification queued', reference };
  }

  // ─── HTTP: queue status (dev only) ───────────────────────
  @Get('queue/status')
  async getQueueStatus() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.paymentQueue.getWaitingCount(),
      this.paymentQueue.getActiveCount(),
      this.paymentQueue.getCompletedCount(),
      this.paymentQueue.getFailedCount(),
      this.paymentQueue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}