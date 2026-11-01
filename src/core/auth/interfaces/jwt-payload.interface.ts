/**
 * Estructura mínima stateless del payload contenido en cada token JWT firmado.
 * Permite autorizar peticiones privadas y resolver la estrategia de plan en `O(1)`
 * sin consultar PostgreSQL en cada petición.
 */
export interface JwtPayload {
  /** Identificador único (UUID v4) del usuario autenticado (`User.id`). */
  sub: string;
  /** Correo electrónico normalizado del usuario. */
  email: string;
  /** Identificador del plan de suscripción activo (ej. `'DEFAULT'`). */
  plan: string;
  /** Timestamp UNIX de emisión del token (Issued At). */
  iat?: number;
  /** Timestamp UNIX de expiración del token (Expiration Time). */
  exp?: number;
}
