import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { Link } from '../../models/link.entity';
import {
  CreateLinkAttributes,
  FindLinksOptions,
  ILinkRepository,
  RedirectLinkProjection,
} from '../interfaces/link-repository.interface';

/**
 * Adaptador de infraestructura TypeORM para `ILinkRepository`.
 * Centraliza todas las operaciones relacionales sobre la entidad `Link` (`links`),
 * liberando a `LinksService` de cualquier acoplamiento con TypeORM.
 */
@Injectable()
export class TypeOrmLinkRepository implements ILinkRepository {
  constructor(
    @InjectRepository(Link)
    private readonly ormRepository: Repository<Link>,
  ) {}

  async countByUser(userId: string): Promise<number> {
    return this.ormRepository.count({
      where: { userId },
    });
  }

  async countActiveByUser(userId: string): Promise<number> {
    return this.ormRepository.count({
      where: { userId, isActive: true },
    });
  }

  async existsByShortCode(shortCode: string): Promise<boolean> {
    return this.ormRepository.exists({
      where: { shortCode },
    });
  }

  async findAllByUser(userId: string): Promise<Link[]> {
    return this.ormRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAndCountByUser(
    userId: string,
    options?: FindLinksOptions,
  ): Promise<[Link[], number]> {
    const term = (options?.name || options?.search)?.trim();
    const whereClause: FindOptionsWhere<Link>[] | FindOptionsWhere<Link> = term
      ? [
          { userId, name: ILike(`%${term}%`) },
          { userId, shortCode: ILike(`%${term}%`) },
        ]
      : { userId };

    return this.ormRepository.findAndCount({
      where: whereClause,
      order: { createdAt: 'DESC' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async findByIdAndUser(id: string, userId: string): Promise<Link | null> {
    return this.ormRepository.findOne({
      where: { id, userId },
    });
  }

  async findByShortCodeForRedirect(
    shortCode: string,
  ): Promise<RedirectLinkProjection | null> {
    return this.ormRepository.findOne({
      select: ['id', 'shortCode', 'targetUrl', 'isActive'],
      where: { shortCode },
    });
  }

  async findIdsByShortCodes(
    shortCodes: string[],
  ): Promise<Array<{ id: string; shortCode: string }>> {
    if (shortCodes.length === 0) {
      return [];
    }
    return this.ormRepository.find({
      select: ['id', 'shortCode'],
      where: { shortCode: In(shortCodes) },
    });
  }

  async createAndSave(attributes: CreateLinkAttributes): Promise<Link> {
    const linkEntity = this.ormRepository.create(attributes);
    return this.ormRepository.save(linkEntity);
  }

  async save(link: Link): Promise<Link> {
    return this.ormRepository.save(link);
  }

  async remove(link: Link): Promise<void> {
    await this.ormRepository.remove(link);
  }
}
