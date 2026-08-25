// payments.repository.ts
import {
    Injectable,
    Logger,
    ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus } from './schema/payment.schema';
import { Refund, RefundDocument, RefundStatus } from './schema/refund.schema';

@Injectable()
export class PaymentsRepository {
    private readonly logger = new Logger(PaymentsRepository.name);

    constructor(
        @InjectModel(Payment.name)
        private readonly paymentModel: Model<PaymentDocument>,
        @InjectModel(Refund.name)
        private readonly refundModel: Model<RefundDocument>,
    ) { }

    async createPaymentAtomic(data: Partial<Payment>): Promise<PaymentDocument> {
        try {
            const payment = new this.paymentModel(data);
            return await payment.save();
        } catch (error: any) {
            if (error.code === 11000) {
                const existing = await this.paymentModel.findOne({
                    idempotencyKey: data.idempotencyKey,
                });
                if (existing) {
                    this.logger.warn(
                        `Race condition caught — returning existing payment: ${existing.paymentId}`,
                    );
                    return existing;
                }
            }
            throw error;
        }
    }

    async updatePaymentStatusAtomic(
        reference: string,
        fromStatus: PaymentStatus,
        toStatus: PaymentStatus,
        extra?: Partial<Payment>,
    ): Promise<PaymentDocument | null> {
        return this.paymentModel.findOneAndUpdate(
            {
                reference,
                status: fromStatus,
                isProcessing: false,
            },
            {
                $set: {
                    status: toStatus,
                    isProcessing: false,
                    ...extra,
                },
            },
            { new: true },
        );
    }

    async acquireProcessingLock(reference: string): Promise<boolean> {
        const result = await this.paymentModel.findOneAndUpdate(
            {
                reference,
                isProcessing: false,
                status: PaymentStatus.PENDING,
            },
            {
                $set: { isProcessing: true },
            },
            { new: true },
        );
        return result !== null;
    }

    async releaseProcessingLock(reference: string): Promise<void> {
        await this.paymentModel.findOneAndUpdate(
            { reference },
            { $set: { isProcessing: false } },
        );
    }

    async findPaymentByReference(reference: string): Promise<PaymentDocument | null> {
        return this.paymentModel.findOne({ reference });
    }

    async findPaymentByIdempotencyKey(key: string): Promise<PaymentDocument | null> {
        return this.paymentModel.findOne({ idempotencyKey: key });
    }

    async findPaymentsByUserId(userId: string): Promise<PaymentDocument[]> {
        return this.paymentModel.find({ userId }).sort({ createdAt: -1 });
    }

    async createRefund(data: Partial<Refund>): Promise<RefundDocument> {
        try {
            const refund = new this.refundModel(data);
            return await refund.save();
        } catch (error: any) {
            if (error.code === 11000) {
                throw new ConflictException('Refund already exists for this idempotency key');
            }
            throw error;
        }
    }

    async updateRefundStatus(
        refundId: string,
        status: RefundStatus,
        extra?: Partial<Refund>,
    ): Promise<RefundDocument | null> {
        return this.refundModel.findOneAndUpdate(
            { refundId },
            { $set: { status, ...extra } },
            { new: true },
        );
    }

    async getTotalRefundedForPayment(paymentId: string): Promise<number> {
        const result = await this.refundModel.aggregate([
            {
                $match: {
                    paymentId,
                    status: RefundStatus.COMPLETED,
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                },
            },
        ]);
        return result[0]?.total ?? 0;
    }
}