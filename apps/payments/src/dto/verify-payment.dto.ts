// dto/verify-payment.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyPaymentDto {
    @IsString()
    @IsNotEmpty()
    reference: string;
}