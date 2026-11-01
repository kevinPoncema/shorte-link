import {
  STARTER_ANALYTICS_RETENTION_DAYS,
  STARTER_MAX_ACTIVE_LINKS,
  StarterPlanStrategy,
} from './starter-plan.strategy';

/**
 * Alias de compatibilidad que apunta a `StarterPlanStrategy`.
 * La estrategia predeterminada del sistema es ahora el **Plan Starter (Gratuito / Físico)**.
 */
export {
  STARTER_ANALYTICS_RETENTION_DAYS,
  STARTER_MAX_ACTIVE_LINKS,
  StarterPlanStrategy,
  StarterPlanStrategy as DefaultPlanStrategy,
};
