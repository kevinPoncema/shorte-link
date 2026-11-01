import { IUserRepository } from '../interfaces/user-repository.interface';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      createAndSave: jest.fn(),
      findById: jest.fn(),
      updatePlanTier: jest.fn(),
    };
    usersService = new UsersService(mockUserRepository);
  });

  it('delegates findById to the repository with trimmed id', async () => {
    const fakeUser = { id: 'u-1', email: 'u1@test.com' } as any;
    mockUserRepository.findById.mockResolvedValue(fakeUser);

    const result = await usersService.findById('  u-1  ');

    expect(mockUserRepository.findById).toHaveBeenCalledWith('u-1');
    expect(result).toBe(fakeUser);
  });

  it('delegates updatePlanTier to the repository with normalized tier and id', async () => {
    mockUserRepository.updatePlanTier.mockResolvedValue(undefined);

    await usersService.updatePlanTier('  u-1  ', '  pro  ');

    expect(mockUserRepository.updatePlanTier).toHaveBeenCalledWith('u-1', 'PRO');
  });
});
