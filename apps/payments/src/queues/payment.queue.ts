// queues/payment.queue.ts
export const PAYMENT_QUEUE = 'payment_queue';

export enum PaymentJob {
    VERIFY_PAYMENT = 'verify_payment',
    PROCESS_WEBHOOK = 'process_webhook',
    PROCESS_REFUND = 'process_refund',
}