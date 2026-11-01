import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../models/subscription.entity';

/**
 * Servicio base de facturación (`BillingModule`).
 * Expone consultas sobre la entidad `Subscription` para preparar la integración
 * futura con pasarelas de pago externas.
 */
@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
  ) {}

  /**
   * Busca la suscripción asociada al identificador UUID de un usuario.
   */
  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.subscriptionsRepository.findOne({
      where: { userId },
    });
  }
}
