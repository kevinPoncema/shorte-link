import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  IPlanRepository,
  PLAN_REPOSITORY,
} from '../../../plans/interfaces/plan-repository.interface';
import { User } from '../../models/user.entity';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../interfaces/user-repository.interface';

/**
 * Identificador del plan asignado automáticamente a toda cuenta nueva durante el registro.
 * Corresponde al **Plan Starter (Gratuito / Físico)**.
 */
export const DEFAULT_PLAN_ID = 'STARTER';

export type AuthResponse = AuthResponseDto;

/**
 * Servicio de dominio de autenticación del Control Plane.
 * Implementa el patrón **Orquestador** y los principios **SOLID** (SRP, DIP),
 * dependiendo exclusivamente de contratos de repositorio (`IUserRepository`, `IPlanRepository`)
 * sin acoplamiento con TypeORM.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PLAN_REPOSITORY)
    private readonly planRepository: IPlanRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * **Orquestador de Registro de Usuario (`POST /auth/register`):**
   * 1. Normaliza el correo electrónico.
   * 2. Verifica disponibilidad del correo en el dominio.
   * 3. Garantiza la existencia del plan base (`DEFAULT`).
   * 4. Genera el hash criptográfico de la contraseña.
   * 5. Persiste la nueva entidad de usuario.
   * 6. Construye la respuesta de sesión con su token JWT firmado.
   *
   * @param dto Credenciales de registro validadas.
   * @throws {ConflictException} Cuando el correo electrónico ya se encuentra registrado.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    await this.assertEmailIsAvailable(normalizedEmail);
    await this.ensureDefaultPlanExists();

    const passwordHash = await this.hashPassword(dto.password);
    const savedUser = await this.persistNewUser(normalizedEmail, passwordHash);

    return this.buildAuthSessionResponse(savedUser);
  }

  /**
   * **Orquestador de Inicio de Sesión (`POST /auth/login`):**
   * 1. Normaliza el correo electrónico.
   * 2. Recupera el usuario con su hash de contraseña o lanza error de credenciales.
   * 3. Verifica la coincidencia criptográfica de la contraseña.
   * 4. Construye la respuesta de sesión con un nuevo token JWT stateless.
   *
   * @param dto Credenciales de acceso.
   * @throws {UnauthorizedException} Cuando el correo no existe o la contraseña no coincide.
   */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const user = await this.getUserWithCredentialsOrThrow(normalizedEmail);
    await this.verifyPasswordOrThrow(dto.password, user.password);

    return this.buildAuthSessionResponse(user);
  }

  // ===========================================================================
  // Funciones Auxiliares de Dominio (Single Responsibility Principle)
  // ===========================================================================

  /**
   * Normaliza un correo electrónico recortando espacios y convirtiendo a minúsculas.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Comprueba que ningún otro usuario tenga registrado el correo electrónico indicado.
   */
  private async assertEmailIsAvailable(email: string): Promise<void> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }
  }

  /**
   * Garantiza de forma idempotente que el plan `'STARTER'` exista en el repositorio de planes.
   */
  private async ensureDefaultPlanExists(): Promise<void> {
    const existingPlan = await this.planRepository.findById(DEFAULT_PLAN_ID);
    if (!existingPlan) {
      await this.planRepository.createAndSave({
        id: DEFAULT_PLAN_ID,
        name: 'Plan Starter (Gratuito / Físico)',
        isActive: true,
      });
    }
  }

  /**
   * Calcula el hash `bcrypt` de una contraseña en texto plano según las rondas configuradas.
   */
  private async hashPassword(plainPassword: string): Promise<string> {
    const saltRounds = Number(
      this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10),
    );
    return bcrypt.hash(plainPassword, saltRounds);
  }

  /**
   * Crea y almacena un nuevo usuario asignándole el plan por defecto.
   */
  private async persistNewUser(
    email: string,
    passwordHash: string,
  ): Promise<User> {
    return this.userRepository.createAndSave({
      email,
      password: passwordHash,
      planId: DEFAULT_PLAN_ID,
    });
  }

  /**
   * Obtiene un usuario junto con su hash de contraseña o lanza `UnauthorizedException`.
   */
  private async getUserWithCredentialsOrThrow(email: string): Promise<User> {
    const user = await this.userRepository.findByEmailWithPassword(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  /**
   * Compara la contraseña suministrada contra el hash `bcrypt` almacenado.
   */
  private async verifyPasswordOrThrow(
    plainPassword: string,
    passwordHash: string,
  ): Promise<void> {
    const isPasswordValid = await bcrypt.compare(plainPassword, passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  /**
   * Construye el DTO de respuesta de autenticación firmando el token JWT del usuario.
   */
  private async buildAuthSessionResponse(user: User): Promise<AuthResponseDto> {
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
   * Firma de forma asíncrona las claims mínimas requeridas por el Control Plane.
   */
  private async signToken(
    payload: Pick<JwtPayload, 'sub' | 'email' | 'plan'>,
  ): Promise<string> {
    return this.jwtService.signAsync(payload);
  }
}
