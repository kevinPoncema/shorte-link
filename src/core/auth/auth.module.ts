import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansModule } from '../../plans/plans.module';
import { User } from '../models/user.entity';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { USER_REPOSITORY } from './interfaces/user-repository.interface';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PlansModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_SECRET',
          'dev-fallback-jwt-secret',
        ),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '1d',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: TypeOrmUserRepository,
    },
    AuthService,
    UsersService,
    JwtAuthGuard,
  ],
  exports: [
    USER_REPOSITORY,
    AuthService,
    UsersService,
    JwtAuthGuard,
    JwtModule,
    TypeOrmModule,
  ],
})
export class AuthModule {}
