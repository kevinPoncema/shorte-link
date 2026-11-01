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

  async findByCustomerId(customerId: string): Promise<Subscription | null> {
    return this.ormRepository.findOne({
      where: { providerCustomerId: customerId },
    });
  }

  async findBySubscriptionId(
    subscriptionId: string,
  ): Promise<Subscription | null> {
    return this.ormRepository.findOne({
      where: { providerSubscriptionId: subscriptionId },
    });
  }

  async save(subscription: Partial<Subscription>): Promise<Subscription> {
    return this.ormRepository.save(subscription);
  }

  async upsert(subscription: Partial<Subscription>): Promise<Subscription> {
    if (subscription.userId) {
      const existing = await this.findByUserId(subscription.userId);
      if (existing) {
        Object.assign(existing, subscription);
        return this.ormRepository.save(existing);
      }
    }
    const created = this.ormRepository.create(subscription);
    return this.ormRepository.save(created);
  }
}
