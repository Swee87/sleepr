import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DatabaseModule } from '@app/common';
import { UserDocument, UserSchema } from './models/users.schema';
import { UsersRepository } from './users.repository';
import { LoggerModule } from '@app/common';
import * as Joi from 'joi';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    DatabaseModule,
    DatabaseModule.forFeature([
      {
        name: UserDocument.name,
        schema: UserSchema,
      },
    ]),
    LoggerModule,
    // ConfigModule.forRoot({
    //   isGlobal: true,
    //   envFilePath: './apps/auth/.env',
    //   validationSchema: Joi.object({
    //     MONGODB_URI: Joi.string().required(),
    //     JWT_SECRET: Joi.string().required(),
    //     JWT_EXPIRES_IN: Joi.number().required(),
    //   })
    // }),

  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService]
})
export class UsersModule { }
