import {
    CanActivate,
    ExecutionContext,
    Inject,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, catchError, map, of, tap } from "rxjs";
import { AUTH_SERVICE } from "@app/common/constants/services";
import { ClientProxy } from "@nestjs/microservices";
import { UserDto } from "@app/common";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private readonly logger = new Logger(JwtAuthGuard.name);

    constructor(
        @Inject(AUTH_SERVICE) private readonly authClient: ClientProxy,
        private readonly reflector: Reflector,
    ) { }

    canActivate(context: ExecutionContext): Observable<boolean> {
        const jwt =
            context.switchToHttp().getRequest().cookies?.Authentication ||
            context.switchToHttp().getRequest().headers?.authentication;

        if (!jwt) {
            return of(false);
        }

        const roles = this.reflector.get<string[]>('roles', context.getHandler());

        return this.authClient.send<UserDto>('authenticate', {
            Authentication: jwt
        }).pipe(
            tap((response) => {
                if (roles) {
                    for (const role of roles) {
                        if (!response.roles?.includes(role)) {
                            this.logger.error('The user does not have valid roles.');
                            throw new UnauthorizedException();
                        }
                    }
                }
                context.switchToHttp().getRequest().user = response;
            }),
            map(() => true),
            catchError((err) => {
                this.logger.error(err);
                return of(false);
            })
        );
    }
}
