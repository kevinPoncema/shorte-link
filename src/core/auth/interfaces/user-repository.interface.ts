import { User } from '../../models/user.entity';

/**
 * Token de inyección de dependencias para el repositorio de usuarios (`IUserRepository`).
 * Implementa el Principio de Inversión de Dependencias (SOLID - DIP).
 */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Atributos de dominio necesarios para persistir un nuevo usuario en el sistema.
 */
export interface CreateUserAttributes {
  email: string;
  password: string;
  planId: string;
}

/**
 * Contrato de repositorio de dominio para la entidad `User`.
 * Aísla completamente al servicio de autenticación del motor ORM.
 */
export interface IUserRepository {
  /**
   * Busca un usuario por su correo electrónico normalizado (sin incluir el hash de contraseña).
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Busca un usuario por correo electrónico incluyendo explícitamente el hash de contraseña
   * para procesos de verificación de credenciales.
   */
  findByEmailWithPassword(email: string): Promise<User | null>;

  /**
   * Crea y guarda un nuevo registro de usuario en la capa de persistencia.
   */
  createAndSave(attributes: CreateUserAttributes): Promise<User>;

  /**
   * Busca un usuario por su identificador único (UUID).
   */
  findById(id: string): Promise<User | null>;

  /**
   * Actualiza el nivel de plan (`planId` / `planTier`) del usuario en persistencia.
   */
  updatePlanTier(userId: string, planTier: string): Promise<void>;
}
