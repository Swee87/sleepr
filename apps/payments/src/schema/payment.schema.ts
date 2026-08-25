// schemas/payment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
    PENDING = 'PENDING',
    PAID = 'PAID',
    FAILED = 'FAILED',
    REFUNDED = 'REFUNDED',
}

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Payment {
    @Prop({ required: true, unique: true })
    paymentId: string;

    @Prop({ required: true })
    userId: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    amount: number;

    @Prop({ default: 'NGN' })
    currency: string;

    @Prop({ required: true, unique: true })
    reference: string;

    @Prop({ default: PaymentStatus.PENDING, enum: PaymentStatus })
    status: PaymentStatus;

    @Prop({ default: 'paystack' })
    provider: string;

    @Prop()
    paymentUrl: string;

    @Prop()
    accessCode: string;

    @Prop()
    channel: string;

    @Prop({ required: true, unique: true, index: true })
    idempotencyKey: string;

    @Prop({ type: Object })
    gatewayResponse: Record<string, any>;

    @Prop()
    paidAt: Date;

    @Prop()
    failedAt: Date;

    @Prop({ default: false })
    isProcessing: boolean; // ← acts as a soft lock
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ userId: 1, status: 1 });
// PaymentSchema.index({ reference: 1 }, { unique: true });
// PaymentSchema.index({ idempotencyKey: 1 }, { unique: true });