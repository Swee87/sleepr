// apps/reservations/src/dto/create-reservation.dto.ts
import { IsDate, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReservationDto {
    @IsDate()
    @Type(() => Date)
    startDate: Date;

    @IsDate()
    @Type(() => Date)
    endDate: Date;

    @IsString()
    @IsNotEmpty()
    placeId: string;

    @IsString()
    @IsNotEmpty()
    invoiceId: string;

    @IsNumber()
    @Min(100) // minimum ₦100
    amount: number; // ← add this
}
// import { IsDate, IsNotEmpty, IsString } from "class-validator";
// import { Type } from "class-transformer";

// export class CreateReservationDto {
//     @IsDate()
//     @Type(() => Date)
//     startDate: Date
//     @IsDate()
//     @Type(() => Date)
//     endDate: Date
//     @IsString()
//     @IsNotEmpty()
//     placeId: string
//     @IsString()
//     @IsNotEmpty()
//     invoiceId: string
// }
