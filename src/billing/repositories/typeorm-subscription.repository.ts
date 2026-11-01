import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ISubscriptionRepository } from '../interfaces/subscription-repository.interface';
import { Subscription } from '../models/subscription.entity';

/**
 * Adaptador de infraestructura TypeORM para `ISubscriptionRepository`.
 * Encapsula las consultas sobre la tabla `subscriptions`.
 */
@Injectable()
export class TypeOrmSubscriptionRepository implements ISubscriptionRepository {
  constructor(
    @InjectRepository(Subscription)
    private readonly ormRepository: Repository<Subscription>,
  ) {}

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.ormRepository.findOne({
      where: { userId },
    });
  }
}
