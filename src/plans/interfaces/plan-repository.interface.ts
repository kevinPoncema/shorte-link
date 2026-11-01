import { Plan } from '../models/plan.entity';

/**
 * Token de inyección de dependencias para el repositorio de planes (`IPlanRepository`).
 * Permite aplicar el Principio de Inversión de Dependencias (SOLID - DIP) desacoplando
 * la capa de servicios del ORM subyacente.
 */
export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');


export interface CreatePlanAttributes {
  id: string;
  name: string;
  isActive: boolean;
}


export interface IPlanRepository {
  findById(id: string): Promise<Plan | null>;
  findAll(): Promise<Plan[]>;
  createAndSave(attributes: CreatePlanAttributes): Promise<Plan>;
}
