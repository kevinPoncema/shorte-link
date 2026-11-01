import { IPlanRepository } from '../../../plans/interfaces/plan-repository.interface';
import { IUserRepository } from '../interfaces/user-repository.interface';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockPlanRepository: jest.Mocked<IPlanRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      createAndSave: jest.fn(),
      findById: jest.fn(),
      updatePlanTier: jest.fn(),
    };
    mockPlanRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      createAndSave: jest.fn(),
    };
    usersService = new UsersService(mockUserRepository, mockPlanRepository);
  });

  it('delegates findById to the repository with trimmed id', async () => {
    const fakeUser = { id: 'u-1', email: 'u1@test.com' } as any;
    mockUserRepository.findById.mockResolvedValue(fakeUser);

    const result = await usersService.findById('  u-1  ');

    expect(mockUserRepository.findById).toHaveBeenCalledWith('u-1');
    expect(result).toBe(fakeUser);
  });

  it('seeds missing plan tier before delegating updatePlanTier to avoid FK violations', async () => {
    mockPlanRepository.findById.mockResolvedValue(null);
    mockPlanRepository.createAndSave.mockResolvedValue({
      id: 'PRO',
      name: 'Plan Pro / Premium ($9 - $15/mes)',
      isActive: true,
    } as any);
    mockUserRepository.updatePlanTier.mockResolvedValue(undefined);

    await usersService.updatePlanTier('  u-1  ', '  pro  ');

    expect(mockPlanRepository.findById).toHaveBeenCalledWith('PRO');
    expect(mockPlanRepository.createAndSave).toHaveBeenCalledWith({
      id: 'PRO',
      name: 'Plan Pro / Premium ($9 - $15/mes)',
      isActive: true,
    });
    expect(mockUserRepository.updatePlanTier).toHaveBeenCalledWith('u-1', 'PRO');
  });

  it('does not re-insert plan record when tier already exists in catalog', async () => {
    mockPlanRepository.findById.mockResolvedValue({
      id: 'STARTER',
      name: 'Plan Starter',
      isActive: true,
    } as any);
    mockUserRepository.updatePlanTier.mockResolvedValue(undefined);

    await usersService.updatePlanTier('u-1', 'starter');

    expect(mockPlanRepository.findById).toHaveBeenCalledWith('STARTER');
    expect(mockPlanRepository.createAndSave).not.toHaveBeenCalled();
    expect(mockUserRepository.updatePlanTier).toHaveBeenCalledWith(
      'u-1',
      'STARTER',
    );
  });
});
