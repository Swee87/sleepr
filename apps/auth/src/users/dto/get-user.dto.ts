import { IsMongoId, IsNotEmpty, IsString } from "class-validator";

export class GetUserDto {
    @IsString()
    @IsNotEmpty()
    @IsMongoId()
    _id: string;
}