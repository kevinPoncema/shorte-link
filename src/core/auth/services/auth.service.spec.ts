import {
  ConflictException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Plan } from '../../../plans/models/plan.entity';
import { User } from '../../models/user.entity';
import { AuthController } from '../controllers/auth.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService, DEFAULT_PLAN_ID } from './auth.service';

describe('AuthService, AuthController & JwtAuthGuard', () => {
  const jwtSecret = 'unit-test-secret';
  let jwtService: JwtService;
  let configService: ConfigService;
  let authService: AuthService;
  let authController: AuthController;
  let guard: JwtAuthGuard;

  let storedUsers: User[];
  let storedPlans: Plan[];
  let plansRepoSaveMock: jest.Mock;

  beforeEach(() => {
    storedUsers = [];
    storedPlans = [];

    jwtService = new JwtService({
      secret: jwtSecret,
      signOptions: { expiresIn: '1h' },
    });

    configService = new ConfigService({
      JWT_SECRET: jwtSecret,
      BCRYPT_SALT_ROUNDS: 4,
    });

    const usersRepositoryMock = {
      findOne: jest.fn(async ({ where }: { where: { email: string } }) =>
        storedUsers.find((u) => u.email === where.email) ?? null,
      ),
      create: jest.fn((partial: Partial<User>) => ({
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date('2026-10-31T00:00:00.000Z'),
        updatedAt: new Date('2026-10-31T00:00:00.000Z'),
        ...partial,
      })),
      save: jest.fn(async (user: User) => {
        storedUsers.push(user);
        return user;
      }),
      createQueryBuilder: jest.fn(() => {
        let emailFilter = '';
        const qb = {
          addSelect: jest.fn(() => qb),
          where: jest.fn((_clause: string, params: { email: string }) => {
            emailFilter = params.email;
            return qb;
          }),
          getOne: jest.fn(async () =>
            storedUsers.find((u) => u.email === emailFilter) ?? null,
          ),
        };
        return qb;
      }),
    };

    plansRepoSaveMock = jest.fn(async (plan: Plan) => {
      storedPlans.push(plan);
      return plan;
    });

    const plansRepositoryMock = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
        storedPlans.find((p) => p.id === where.id) ?? null,
      ),
      create: jest.fn((partial: Partial<Plan>) => partial as Plan),
      save: plansRepoSaveMock,
    };

    authService = new AuthService(
      usersRepositoryMock as never,
      plansRepositoryMock as never,
      jwtService,
      configService,
    );

    authController = new AuthController(authService);
    guard = new JwtAuthGuard(jwtService, configService);
  });

  describe('Registration (Happy, Sad & Edge Cases)', () => {
    it('registers user, trims/lowercases email, hashes password, creates DEFAULT plan once, and signs JWT', async () => {
      const first = await authController.register({
        email: '  Cliente@Empresa.com  ',
        password: 'StrongPassword123!',
      });

      expect(first.user.email).toBe('cliente@empresa.com');
      expect(first.user.plan).toBe(DEFAULT_PLAN_ID);
      expect(storedPlans).toHaveLength(1);
      expect(plansRepoSaveMock).toHaveBeenCalledTimes(1);

      expect(storedUsers[0].password).not.toBe('StrongPassword123!');
      await expect(
        bcrypt.compare('StrongPassword123!', storedUsers[0].password),
      ).resolves.toBe(true);

      const decoded = await jwtService.verifyAsync<JwtPayload>(
        first.accessToken,
      );
      expect(decoded).toMatchObject({
        sub: first.user.id,
        email: 'cliente@empresa.com',
        plan: 'DEFAULT',
      });

      await authController.register({
        email: 'segundo@empresa.com',
        password: 'StrongPassword123!',
      });
      expect(plansRepoSaveMock).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate email registration case-insensitively with ConflictException', async () => {
      await authService.register({
        email: 'dup@empresa.com',
        password: 'StrongPassword123!',
      });

      await expect(
        authService.register({
          email: '  DUP@EMPRESA.COM ',
          password: 'AnotherPassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Login (Happy, Sad & Edge Cases)', () => {
    it('authenticates valid credentials with trimmed/uppercase email and falls back to DEFAULT when planId is null', async () => {
      await authService.register({
        email: 'nullplan@empresa.com',
        password: 'CorrectPassword123!',
      });
      // Edge case: legacy or detached user with null planId in DB
      storedUsers[0].planId = null;

      const loginRes = await authController.login({
        email: '  NULLPLAN@EMPRESA.COM ',
        password: 'CorrectPassword123!',
      });

      expect(loginRes.user.plan).toBe('DEFAULT');
      const decoded = await jwtService.verifyAsync<JwtPayload>(
        loginRes.accessToken,
      );
      expect(decoded.plan).toBe('DEFAULT');
    });

    it('rejects wrong password or unregistered email with UnauthorizedException', async () => {
      await authService.register({
        email: 'login@empresa.com',
        password: 'CorrectPassword123!',
      });

      await expect(
        authService.login({
          email: 'login@empresa.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        authService.login({
          email: 'unknown@empresa.com',
          password: 'CorrectPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('JwtAuthGuard (Happy, Sad & Edge Cases)', () => {
    const buildContext = (authHeader?: string) => {
      const req: { headers: Record<string, string | undefined>; user?: JwtPayload } = {
        headers: authHeader !== undefined ? { authorization: authHeader } : {},
      };
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext;
      return { ctx, req };
    };

    it('populates req.user with decoded payload on valid Bearer token', async () => {
      const { accessToken, user } = await authService.register({
        email: 'guard@empresa.com',
        password: 'StrongPassword123!',
      });

      const { ctx, req } = buildContext(`Bearer ${accessToken}`);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toMatchObject({
        sub: user.id,
        email: 'guard@empresa.com',
        plan: 'DEFAULT',
      });
    });

    it('rejects missing header, non-Bearer scheme, empty Bearer token, wrong secret, and expired tokens', async () => {
      await expect(guard.canActivate(buildContext().ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(
        guard.canActivate(buildContext('Basic dXNlcjpwYXNz').ctx),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        guard.canActivate(buildContext('Bearer ').ctx),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        guard.canActivate(buildContext('Bearer malformed.token.value').ctx),
      ).rejects.toThrow(UnauthorizedException);

      const otherJwt = new JwtService({ secret: 'different-secret' });
      const foreignToken = await otherJwt.signAsync({
        sub: '123',
        email: 'a@b.com',
        plan: 'DEFAULT',
      });
      await expect(
        guard.canActivate(buildContext(`Bearer ${foreignToken}`).ctx),
      ).rejects.toThrow(UnauthorizedException);

      const expiredToken = await jwtService.signAsync(
        { sub: '123', email: 'a@b.com', plan: 'DEFAULT' },
        { expiresIn: -10 },
      );
      await expect(
        guard.canActivate(buildContext(`Bearer ${expiredToken}`).ctx),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
