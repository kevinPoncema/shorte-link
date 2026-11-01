import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IOrderRepository } from '../interfaces/order-repository.interface';
import { Order } from '../models/order.entity';

/**
 * Adaptador de infraestructura TypeORM para `IOrderRepository`.
 */
@Injectable()
export class TypeOrmOrderRepository implements IOrderRepository {
  constructor(
    @InjectRepository(Order)
    private readonly ormRepository: Repository<Order>,
  ) {}

  async findById(id: string): Promise<Order | null> {
    return this.ormRepository.findOne({
      where: { id },
      relations: ['items'],
    });
  }

  async findByUserId(userId: string): Promise<Order[]> {
    return this.ormRepository.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByPaymentIntentId(
    paymentIntentId: string,
  ): Promise<Order | null> {
    return this.ormRepository.findOne({
      where: { providerPaymentIntentId: paymentIntentId },
      relations: ['items'],
    });
  }

  async createAndSave(order: Partial<Order>): Promise<Order> {
    const entity = this.ormRepository.create(order);
    return this.ormRepository.save(entity);
  }

  async update(id: string, partial: Partial<Order>): Promise<void> {
    await this.ormRepository.update({ id }, partial);
  }
}
