
import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    Min,
} from 'class-validator';

export class RefundPaymentDto {
    @IsString()
    @IsNotEmpty()
    reference: string;

    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsNumber()
    @IsOptional()
    @Min(100)
    amount?: number;
}