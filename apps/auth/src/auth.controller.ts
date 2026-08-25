import { Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '@app/common';
import { UserDocument } from './users/models/users.schema';
import { Response } from 'express';
import { MessagePattern } from '@nestjs/microservices';
import { UserDto } from '@app/common';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @CurrentUser() user: UserDocument,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.login(user, res);
    res.send(user);
  }

  @Get()
  getHello(): string {
    return this.authService.getHello();
  }

  @UseGuards(JwtAuthGuard)
  @MessagePattern('authenticate')
  async authenticate(@CurrentUser() user: UserDto) {
    console.log('Authenticated user:', user);
    return user;
  }
}

// import { Controller, Get, Post, Res } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { UseGuards } from '@nestjs/common';
// import { LocalAuthGuard } from './guards/local-auth.guard';
// import { CurrentUser } from '@app/common';
// import { UserDocument } from './users/models/users.schema';
// import { Response } from 'express';
// import { MessagePattern, Payload } from '@nestjs/microservices';
// import { JwtAuthGuard } from './guards/jwt-auth.guard';

// @Controller('auth')
// export class AuthController {
//   constructor(private readonly authService: AuthService) { }
//   @UseGuards(LocalAuthGuard)
//   @Post('login')
//   async login(@CurrentUser() user: UserDocument, @Res({ passthrough: true }) res: Response) {
//     await this.authService.login(user, res);
//     res.send(user);
//   }
//   @Get()
//   getHello(): string {
//     return this.authService.getHello();
//   }
//   @UseGuards(JwtAuthGuard)
//   @MessagePattern('authenticate')
//   async authenticate(@Payload() data: any) {
//     console.log(data);
//     return data.user;
//   }
// } 
