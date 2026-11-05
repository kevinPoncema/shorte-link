/**
 * Estructura mínima stateless del payload contenido en cada token JWT firmado.
 * Permite autorizar peticiones privadas y resolver la estrategia de plan en `O(1)`
 * sin consultar PostgreSQL en cada petición.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  plan: string;
  iat?: number;
  exp?: number;
}
