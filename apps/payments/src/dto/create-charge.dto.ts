// dto/create-charge.dto.ts
import {
    IsEmail,
    IsNumber,
    IsString,
    IsOptional,
    IsArray,
    IsIn,
    Min,
} from 'class-validator';

export type PaymentChannel = 'card' | 'bank_transfer' | 'ussd' | 'bank' | 'qr';

export class CreateChargeDto {
    @IsString()
    userId: string;

    @IsEmail()
    email: string;

    @IsNumber()
    @Min(100) // minimum ₦100
    amount: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsArray()
    @IsIn(['card', 'bank_transfer', 'ussd', 'bank', 'qr'], { each: true })
    channels?: PaymentChannel[];
}