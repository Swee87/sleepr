import { IsEmail, IsString } from "class-validator";

export class UserDto {
    @IsString()
    _id: string;
    @IsEmail()
    email: string;
    @IsString()
    name: string;
    roles?: string[];
}
