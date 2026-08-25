import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RefundDocument = Refund & Document;

export enum RefundStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

@Schema({ timestamps: true })
export class Refund {
    @Prop({ required: true, unique: true })
    refundId: string;

    @Prop({ required: true })
    paymentId: string; // references Payment.paymentId

    @Prop({ required: true })
    userId: string;

    @Prop({ required: true })
    amount: number;

    @Prop()
    reason: string;

    @Prop({ default: RefundStatus.PENDING, enum: RefundStatus })
    status: RefundStatus;

    @Prop()
    providerRefundId: string; // Paystack refund ID

    @Prop()
    idempotencyKey: string;

    @Prop({ type: Object })
    gatewayResponse: Record<string, any>;

    @Prop()
    completedAt: Date;

    @Prop()
    failedAt: Date;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);