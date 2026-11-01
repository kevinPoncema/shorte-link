/**
 * Payload canónico de un evento de redirección y escaneo QR.
 *
 * Pertenece al dominio de analíticas de enlaces (`links`) y define la estructura
 * de datos que viaja desde el Fast-Path de redirección hasta los workers de analíticas.
 */
export interface ClickEventPayload {
  shortCode: string;
  linkId?: string;
  ipAddress: string;
  country?: string | null;
  userAgent: string | null;
  referer: string | null;
  scannedAt: string;
}

/**
 * Alias semántico para consumidores y procesadores de la cola de eventos.
 */
export type ClickQueuePayload = ClickEventPayload;
