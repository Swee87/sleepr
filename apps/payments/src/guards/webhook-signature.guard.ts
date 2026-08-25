import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        const signature = req.headers['x-paystack-signature'];

        if (!signature) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY');

        if (!secret) {
            throw new UnauthorizedException('Missing webhook secret configuration');
        }

        const rawBody = req.rawBody; // requires raw body setup in main.ts

        if (!rawBody) {
            throw new UnauthorizedException('Missing raw body');
        }

        const hash = crypto
            .createHmac('sha512', secret)
            .update(rawBody)
            .digest('hex');

        // timing-safe comparison
        const hashBuffer = Buffer.from(hash, 'hex');
        const sigBuffer = Buffer.from(signature, 'hex');

        if (
            hashBuffer.length !== sigBuffer.length ||
            !crypto.timingSafeEqual(hashBuffer, sigBuffer)
        ) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

        return true;
    }
}