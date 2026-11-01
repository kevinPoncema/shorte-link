import { Plan } from '../models/plan.entity';
import { StarterPlanStrategy } from '../strategies/starter-plan.strategy';
import { ProPlanStrategy } from '../strategies/pro-plan.strategy';
import { PlanSeeder } from './plan.seeder';

describe('PlanSeeder (Idempotent Database Plan Seeder)', () => {
  let mockPlanRepo: {
    findById: jest.Mock;
    findAll: jest.Mock;
    createAndSave: jest.Mock;
  };

  beforeEach(() => {
    mockPlanRepo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      createAndSave: jest.fn(),
    };
  });

  it('seeds canonical STARTER and PRO plans when database is initially empty', async () => {
    mockPlanRepo.findAll.mockResolvedValue([]);
    mockPlanRepo.createAndSave.mockImplementation(async (attr) => ({
      id: attr.id,
      name: attr.name,
      isActive: attr.isActive,
      users: [],
    } as Plan));

    const seeder = new PlanSeeder(mockPlanRepo as any);
    await seeder.seed();

    expect(mockPlanRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockPlanRepo.createAndSave).toHaveBeenCalledTimes(2);

    expect(mockPlanRepo.createAndSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'STARTER',
        isActive: true,
      }),
    );
    expect(mockPlanRepo.createAndSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'PRO',
        isActive: true,
      }),
    );
  });

  it('is completely idempotent: does not recreate plans that already exist in database', async () => {
    const existingPlans: Plan[] = [
      { id: 'STARTER', name: 'Plan Starter', isActive: true, users: [] },
      { id: 'PRO', name: 'Plan Pro / Premium ($9 - $15/mes)', isActive: true, users: [] },
    ];
    mockPlanRepo.findAll.mockResolvedValue(existingPlans);

    const seeder = new PlanSeeder(mockPlanRepo as any);
    await seeder.seed();

    expect(mockPlanRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockPlanRepo.createAndSave).not.toHaveBeenCalled();
  });

  it('only creates missing plans when some plans already exist (partial seed)', async () => {
    const existingPlans: Plan[] = [
      { id: 'STARTER', name: 'Plan Starter', isActive: true, users: [] },
    ];
    mockPlanRepo.findAll.mockResolvedValue(existingPlans);
    mockPlanRepo.createAndSave.mockImplementation(async (attr) => ({
      id: attr.id,
      name: attr.name,
      isActive: attr.isActive,
      users: [],
    } as Plan));

    const seeder = new PlanSeeder(mockPlanRepo as any);
    await seeder.seed();

    expect(mockPlanRepo.findAll).toHaveBeenCalledTimes(1);
    expect(mockPlanRepo.createAndSave).toHaveBeenCalledTimes(1);
    expect(mockPlanRepo.createAndSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'PRO',
        isActive: true,
      }),
    );
  });

  it('correctly handles case-insensitivity in existing plan IDs', async () => {
    const existingPlans: Plan[] = [
      { id: 'starter', name: 'Plan Starter', isActive: true, users: [] },
      { id: 'pro', name: 'Plan Pro', isActive: true, users: [] },
    ];
    mockPlanRepo.findAll.mockResolvedValue(existingPlans);

    const seeder = new PlanSeeder(mockPlanRepo as any);
    await seeder.seed();

    expect(mockPlanRepo.createAndSave).not.toHaveBeenCalled();
  });

  it('propagates database errors if createAndSave fails', async () => {
    mockPlanRepo.findAll.mockResolvedValue([]);
    mockPlanRepo.createAndSave.mockRejectedValue(new Error('DB Connection Timeout'));

    const seeder = new PlanSeeder(mockPlanRepo as any);
    await expect(seeder.seed()).rejects.toThrow('DB Connection Timeout');
  });

  it('supports registered custom strategies in addition to default strategies', async () => {
    mockPlanRepo.findAll.mockResolvedValue([]);
    mockPlanRepo.createAndSave.mockImplementation(async (attr) => ({
      id: attr.id,
      name: attr.name,
      isActive: attr.isActive,
      users: [],
    } as Plan));

    const customStrategy = {
      tierName: 'ENTERPRISE',
      displayName: 'Plan Enterprise',
      monetizationModel: 'Custom',
      assertCanCreateLink: jest.fn(),
      canCustomizeQrDesign: () => true,
      canUseCustomDomain: () => true,
      getMaxActiveLinks: () => 500,
      getAnalyticsRetentionDays: () => 730,
    };

    const seeder = new PlanSeeder(mockPlanRepo as any, [
      new StarterPlanStrategy(),
      new ProPlanStrategy(),
      customStrategy,
    ]);

    await seeder.seed();
    expect(mockPlanRepo.createAndSave).toHaveBeenCalledTimes(3);
    expect(mockPlanRepo.createAndSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ENTERPRISE',
        name: 'Plan Enterprise',
        isActive: true,
      }),
    );
  });
});
