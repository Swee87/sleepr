// apps/auth/src/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { UsersService } from "../users/users.service";
import { ExtractJwt, Strategy } from "passport-jwt";
import { TokenPayload } from "../interfaces/token-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly usersService: UsersService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request: any) => {
                    if (request?.cookies?.Authentication) {
                        return request.cookies.Authentication;
                    }
                    if (request?.Authentication) {
                        return request.Authentication;
                    }
                    if (request?.headers?.authentication) {
                        return request.headers.authentication;
                    }
                    return null;
                },
            ]),
            secretOrKey: configService.get('JWT_SECRET') as string,
        });
    }

    // apps/auth/src/strategies/jwt.strategy.ts
    async validate({ userId }: TokenPayload) {
        const user = await this.usersService.getUser({ _id: userId });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        return {
            _id: user._id,
            email: user.email,
            roles: user.roles,
        };
    }
}

// import { Injectable } from "@nestjs/common";
// import { ConfigService } from "@nestjs/config";
// import { PassportStrategy } from "@nestjs/passport";
// import { UsersService } from "../users/users.service";
// import { ExtractJwt, Strategy } from "passport-jwt";
// import { TokenPayload } from "../interfaces/token-payload.interface";

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//     constructor(
//         configService: ConfigService,
//         private readonly usersService: UsersService
//     ) {
//         super({
//             jwtFromRequest: ExtractJwt.fromExtractors([
//                 (request: any) => {
//                     // HTTP request (cookie)
//                     if (request?.cookies?.Authentication) {
//                         return request.cookies.Authentication;
//                     }
//                     // TCP microservice payload
//                     if (request?.Authentication) {
//                         return request.Authentication;
//                     }
//                     // HTTP header fallback (lowercase)
//                     if (request?.headers?.authentication) {
//                         return request.headers.authentication;
//                     }
//                     return null;
//                 },
//             ]),
//             secretOrKey: configService.get('JWT_SECRET') as string,
//         });
//     }

//     async validate({ userId }: TokenPayload) {
//         return this.usersService.getUser({ _id: userId });
//     }
// }


// import { Injectable } from "@nestjs/common";
// import { ConfigService } from "@nestjs/config";
// import { PassportStrategy } from "@nestjs/passport";
// import { UsersService } from "../users/users.service";
// import { ExtractJwt, Strategy } from "passport-jwt";
// import { Request } from "express";
// import { TokenPayload } from "../interfaces/token-payload.interface";


// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//     constructor(configService: ConfigService,
//         private readonly usersService: UsersService
//     ) {
//         super({
//             jwtFromRequest: ExtractJwt.fromExtractors([
//                 (request: any) => {
//                     console.log(request.cookies);
//                     return request?.cookies?.Authentication || request?.headers?.Authentication
//                 },
//             ]),
//             secretOrKey: configService.get('JWT_SECRET') as string,
//         });
//     }

//     async validate({ userId }: TokenPayload) {
//         return this.usersService.getUser({ _id: userId });
//     }
// }
