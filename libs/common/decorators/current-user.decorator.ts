// libs/common/src/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext) => {
        if (context.getType() === 'http') {
            return context.switchToHttp().getRequest().user;
        }
        return context.switchToRpc().getData().user;
    },
);
// import { createParamDecorator, ExecutionContext } from "@nestjs/common";
// import { UserDocument } from "../../../apps/auth/src/users/models/users.schema";
// const getCurrentUserByContext = (context: ExecutionContext): UserDocument => {
//     const request = context.switchToHttp().getRequest();
//     return request.user;
// }
// export const CurrentUser = createParamDecorator(
//     (_data: unknown, context: ExecutionContext) => getCurrentUserByContext(context)
// );