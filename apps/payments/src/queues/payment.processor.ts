// queues/payment.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentsService } from '../payments.service';
import { PAYMENT_QUEUE, PaymentJob } from './payment.queue';

@Processor(PAYMENT_QUEUE)
export class PaymentProcessor extends WorkerHost {
    private readonly logger = new Logger(PaymentProcessor.name);

    constructor(private readonly paymentsService: PaymentsService) {
        super();
    }

    // ─── Main job handler — all jobs route through here ──────────
    async process(job: Job): Promise<any> {
        this.logger.log(`[Queue] Processing job: ${job.name} [id: ${job.id}]`);

        switch (job.name) {
            case PaymentJob.VERIFY_PAYMENT:
                return this.handleVerifyPayment(job);

            case PaymentJob.PROCESS_WEBHOOK:
                return this.handleWebhookProcessing(job);

            case PaymentJob.PROCESS_REFUND:
                return this.handleRefund(job);

            default:
                this.logger.warn(`[Queue] Unknown job: ${job.name}`);
                break;
        }
    }

    // ─── Verify Payment ───────────────────────────────────────────
    // Fires after 10 min delay as fallback if webhook never arrives
    private async handleVerifyPayment(job: Job<{ reference: string }>) {
        this.logger.log(
            `[Queue] Verifying payment: ${job.data.reference} (attempt ${job.attemptsMade + 1})`,
        );
        return this.paymentsService.verifyPayment(job.data.reference);
    }

    // ─── Process Webhook ──────────────────────────────────────────
    // Controller enqueues → processor does actual work here
    // NOT calling handleWebhook() — avoids infinite loop
    private async handleWebhookProcessing(job: Job<{ payload: any }>) {
        this.logger.log(
            `[Queue] Processing webhook: ${job.data.payload.event}`,
        );
        return this.paymentsService.processWebhookEvent(job.data.payload);
    }

    // ─── Process Refund ───────────────────────────────────────────
    private async handleRefund(
        job: Job<{ reference: string; userId: string; amount?: number }>,
    ) {
        this.logger.log(
            `[Queue] Processing refund: ${job.data.reference}`,
        );
        return this.paymentsService.initiateRefund(
            job.data.reference,
            job.data.userId,
            job.data.amount,
        );
    }

    // ─── Worker Event Hooks ───────────────────────────────────────
    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.log(`[Queue] Job completed: ${job.name} [id: ${job.id}]`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(
            `[Queue] Job failed: ${job.name} [id: ${job.id}] attempt ${job.attemptsMade} — ${error.message}`,
            error.stack,
        );
    }

    @OnWorkerEvent('active')
    onActive(job: Job) {
        this.logger.log(`[Queue] Job started: ${job.name} [id: ${job.id}]`);
    }
}