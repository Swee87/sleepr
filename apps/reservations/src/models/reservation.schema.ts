import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { AbstractDocument } from "@app/common";

@Schema({ versionKey: false, timestamps: true })
export class ReservationDocument extends AbstractDocument {
    @Prop({ required: true })
    timeStamp: Date;

    @Prop({ required: true })
    startDate: Date;

    @Prop({ required: true })
    endDate: Date;

    @Prop({ required: true, index: true })
    userId: string;

    @Prop({ required: true })
    placeId: string;

    @Prop({ required: true })
    invoiceId: string;

    @Prop({ required: true })
    amount: number;

    @Prop()
    paymentId: string;

    @Prop({
        default: 'PENDING',
        enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'], // ← restrict values
    })
    paymentStatus: string;
}

export const ReservationSchema = SchemaFactory.createForClass(ReservationDocument);

ReservationSchema.index({ userId: 1 });


// import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
// import { AbstractDocument } from "@app/common";

// @Schema({ versionKey: false })
// export class ReservationDocument extends AbstractDocument {
//     @Prop()
//     timeStamp: Date
//     @Prop()
//     startDate: Date
//     @Prop()
//     endDate: Date
//     @Prop()
//     userId: string
//     @Prop()
//     placeId: string
//     @Prop()
//     invoiceId: string
//     @Prop()
//     paymentId: string;
//     @Prop({ default: 'PENDING' })
//     paymentStatus: string;
//     @Prop()
//     amount: number
// }
// export const ReservationSchema = SchemaFactory.createForClass(ReservationDocument);
// ReservationSchema.index({ userId: 1 })

