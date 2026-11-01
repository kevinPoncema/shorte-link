import { Link, QrConfig } from '../../models/link.entity';

/**
 * Token de inyección de dependencias para el repositorio de enlaces (`ILinkRepository`).
 * Implementa el Principio de Inversión de Dependencias (SOLID - DIP).
 */
export const LINK_REPOSITORY = Symbol('LINK_REPOSITORY');

/**
 * Atributos de dominio necesarios para registrar un nuevo enlace corto.
 */
export interface CreateLinkAttributes {
  shortCode: string;
  name: string | null;
  targetUrl: string;
  isActive: boolean;
  qrConfig: QrConfig;
  userId: string;
}

/**
 * Proyección ligera del enlace requerida por el Fast-Path de redirección en caso de Cache Miss.
 */
export type RedirectLinkProjection = Pick<
  Link,
  'id' | 'shortCode' | 'targetUrl' | 'isActive'
>;

/**
 * Contrato de repositorio de dominio para la entidad `Link`.
 * Separa estrictamente la lógica de negocio de las primitivas de TypeORM.
 */
export interface ILinkRepository {
  /**
   * Cuenta el total de enlaces pertenecientes a un usuario.
   */
  countByUser(userId: string): Promise<number>;

  /**
   * Cuenta el total de enlaces activos (`isActive: true`) pertenecientes a un usuario.
   */
  countActiveByUser(userId: string): Promise<number>;

  /**
   * Verifica si un `shortCode` ya se encuentra asignado en el sistema.
   */
  existsByShortCode(shortCode: string): Promise<boolean>;

  /**
   * Obtiene todos los enlaces de un usuario ordenados por fecha de creación descendente.
   */
  findAllByUser(userId: string): Promise<Link[]>;

  /**
   * Obtiene un enlace por su ID verificando que pertenezca al usuario indicado (prevención IDOR).
   */
  findByIdAndUser(id: string, userId: string): Promise<Link | null>;

  /**
   * Obtiene la proyección mínima de un enlace por su `shortCode` para resolver redirecciones.
   */
  findByShortCodeForRedirect(
    shortCode: string,
  ): Promise<RedirectLinkProjection | null>;

  /**
   * Instancia y persiste un nuevo enlace en la base de datos.
   */
  createAndSave(attributes: CreateLinkAttributes): Promise<Link>;

  /**
   * Persiste los cambios realizados sobre una entidad de dominio `Link` existente.
   */
  save(link: Link): Promise<Link>;

  /**
   * Elimina físicamente un enlace de la capa de persistencia.
   */
  remove(link: Link): Promise<void>;
}
