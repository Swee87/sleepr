import { IsEmail, IsOptional, IsString } from "class-validator";

export class NotifyEmailDto {
    @IsEmail()
    email: string;
    @IsString()
    subject: string;
    @IsString()
    text: string;
    @IsString()
    @IsOptional()
    html?: string;
}