import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Plan } from '../../../plans/models/plan.entity';
import { User } from '../../models/user.entity';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Identificador del plan asignado automáticamente a toda cuenta nueva durante el registro.
 */
export const DEFAULT_PLAN_ID = 'DEFAULT';

export type AuthResponse = AuthResponseDto;

/**
 * Servicio de autenticación del Control Plane.
 * Gestiona el alta de usuarios con hashing `bcrypt`, asignación del plan por defecto
 * y emisión de tokens JWT stateless con información de plan embebida.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registra un nuevo usuario, garantiza la existencia del plan `'DEFAULT'` en PostgreSQL,
   * almacena el hash `bcrypt` de su contraseña y retorna un JWT firmado.
   *
   * @param dto Credenciales de registro validadas.
   * @throws {ConflictException} Cuando el correo electrónico ya se encuentra registrado.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    await this.ensureDefaultPlanExists();

    const saltRounds = Number(
      this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10),
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = this.usersRepository.create({
      email: normalizedEmail,
      password: passwordHash,
      planId: DEFAULT_PLAN_ID,
    });

    const savedUser = await this.usersRepository.save(user);
    const planKey = savedUser.planId ?? DEFAULT_PLAN_ID;
    const accessToken = await this.signToken({
      sub: savedUser.id,
      email: savedUser.email,
      plan: planKey,
    });

    return {
      accessToken,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        plan: planKey,
        createdAt: savedUser.createdAt,
      },
    };
  }

  /**
   * Autentica a un usuario existente verificando su contraseña contra el hash `bcrypt`
   * y firma un nuevo token JWT stateless.
   *
   * @param dto Credenciales de acceso.
   * @throws {UnauthorizedException} Cuando el correo no existe o la contraseña no coincide.
   */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: normalizedEmail })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const planKey = user.planId ?? DEFAULT_PLAN_ID;
    const accessToken = await this.signToken({
      sub: user.id,
      email: user.email,
      plan: planKey,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        plan: planKey,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Garantiza de forma idempotente que la fila `'DEFAULT'` exista en la tabla `plans`
   * antes de insertar el usuario con clave foránea `plan_id`.
   */
  private async ensureDefaultPlanExists(): Promise<void> {
    const existingPlan = await this.plansRepository.findOne({
      where: { id: DEFAULT_PLAN_ID },
    });

    if (!existingPlan) {
      await this.plansRepository.save(
        this.plansRepository.create({
          id: DEFAULT_PLAN_ID,
          name: 'Default',
          isActive: true,
        }),
      );
    }
  }

  /**
   * Firma de forma asíncrona las claims mínimas requeridas por el Control Plane.
   */
  private async signToken(
    payload: Pick<JwtPayload, 'sub' | 'email' | 'plan'>,
  ): Promise<string> {
    return this.jwtService.signAsync(payload);
  }
}
