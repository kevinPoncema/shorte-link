import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../models/user.entity';
import {
  CreateUserAttributes,
  IUserRepository,
} from '../interfaces/user-repository.interface';

/**
 * Adaptador de infraestructura TypeORM para `IUserRepository`.
 * Encapsula la lógica de consultas SQL y QueryBuilder para que `AuthService`
 * opere exclusivamente sobre contratos de dominio.
 */
@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly ormRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.ormRepository.findOne({
      where: { email },
    });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.ormRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async createAndSave(attributes: CreateUserAttributes): Promise<User> {
    const userEntity = this.ormRepository.create(attributes);
    return this.ormRepository.save(userEntity);
  }

  async findById(id: string): Promise<User | null> {
    return this.ormRepository.findOne({
      where: { id },
    });
  }

  async updatePlanTier(userId: string, planTier: string): Promise<void> {
    await this.ormRepository.update({ id: userId }, { planId: planTier });
  }
}
