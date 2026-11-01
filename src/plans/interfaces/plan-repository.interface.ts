import { Plan } from '../models/plan.entity';

/**
 * Token de inyección de dependencias para el repositorio de planes (`IPlanRepository`).
 * Permite aplicar el Principio de Inversión de Dependencias (SOLID - DIP) desacoplando
 * la capa de servicios del ORM subyacente.
 */
export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');

/**
 * Atributos de dominio requeridos para registrar o inicializar un plan.
 */
export interface CreatePlanAttributes {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * Contrato de repositorio de dominio para la entidad `Plan`.
 * Abstrae por completo las operaciones de persistencia de TypeORM.
 */
export interface IPlanRepository {
  /**
   * Busca un plan por su identificador único o código de nivel (ej. `'DEFAULT'`, `'PRO'`).
   */
  findById(id: string): Promise<Plan | null>;

  /**
   * Crea y persiste una nueva entidad de plan en el almacenamiento.
   */
  createAndSave(attributes: CreatePlanAttributes): Promise<Plan>;
}
