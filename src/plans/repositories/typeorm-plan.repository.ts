import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreatePlanAttributes,
  IPlanRepository,
} from '../interfaces/plan-repository.interface';
import { Plan } from '../models/plan.entity';


@Injectable()
export class TypeOrmPlanRepository implements IPlanRepository {
  constructor(
    @InjectRepository(Plan)
    private readonly ormRepository: Repository<Plan>,
  ) { }

  async findById(id: string): Promise<Plan | null> {
    return this.ormRepository.findOne({
      where: { id },
    });
  }

  async findAll(): Promise<Plan[]> {
    return this.ormRepository.find();
  }

  async createAndSave(attributes: CreatePlanAttributes): Promise<Plan> {
    const planEntity = this.ormRepository.create(attributes);
    return this.ormRepository.save(planEntity);
  }
}
