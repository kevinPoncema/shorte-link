import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanContextService } from '../../../plans/services/plan-context.service';
import { ProPlanStrategy } from '../../../plans/strategies/pro-plan.strategy';
import { StarterPlanStrategy } from '../../../plans/strategies/starter-plan.strategy';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { Link } from '../../models/link.entity';
import { ILinkEventRepository } from '../interfaces/link-event-repository.interface';
import { ILinkRepository } from '../interfaces/link-repository.interface';
import { TypeOrmLinkEventRepository } from '../repositories/typeorm-link-event.repository';
import { LinkStatsService } from './link-stats.service';

describe('LinkStatsService & TypeOrmLinkEventRepository', () => {
  const targetLinkId = 'b1b22e11-897c-48c9-9eb1-8848db929c8e';

  const starterUser: JwtPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'starter@empresa.com',
    plan: 'STARTER',
  };

  const proUser: JwtPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'pro@empresa.com',
    plan: 'PRO',
  };

  const intruderUser: JwtPayload = {
    sub: '99999999-9999-4999-8999-999999999999',
    email: 'intruder@empresa.com',
    plan: 'PRO',
  };

  let linkRepositoryMock: jest.Mocked<Pick<ILinkRepository, 'findByIdAndUser'>>;
  let linkEventRepositoryMock: jest.Mocked<ILinkEventRepository>;
  let planContextService: PlanContextService;
  let linkStatsService: LinkStatsService;

  beforeEach(() => {
    const starterStrategy = new StarterPlanStrategy();
    const proStrategy = new ProPlanStrategy();
    planContextService = new PlanContextService(starterStrategy, proStrategy, [
      starterStrategy,
      proStrategy,
    ]);

    linkRepositoryMock = {
      findByIdAndUser: jest.fn(async (id: string, userId: string) => {
        if (id === targetLinkId && userId === starterUser.sub) {
          return {
            id: targetLinkId,
            userId: starterUser.sub,
            shortCode: 'stat123',
            targetUrl: 'https://empresa.com',
            isActive: true,
          } as Link;
        }
        return null;
      }),
    };

    linkEventRepositoryMock = {
      getTotalsAndUniqueVisitors: jest.fn().mockResolvedValue({
        totalClicks: 1420,
        uniqueVisitors: 985,
      }),
      getDailyTimeline: jest.fn().mockResolvedValue([
        { date: '2026-10-25', clicks: 140 },
        { date: '2026-10-26', clicks: 210 },
        { date: '2026-10-27', clicks: 185 },
        { date: '2026-10-28', clicks: 320 },
        { date: '2026-10-29', clicks: 290 },
        { date: '2026-10-30', clicks: 165 },
        { date: '2026-10-31', clicks: 110 },
      ]),
      getTopOsBreakdown: jest.fn().mockResolvedValue([
        { name: 'iOS', count: 850 },
        { name: 'Android', count: 470 },
        { name: 'Windows', count: 75 },
      ]),
      getTopBrowsersBreakdown: jest.fn().mockResolvedValue([
        { name: 'Mobile Safari', count: 780 },
        { name: 'Chrome Mobile', count: 450 },
        { name: 'Chrome', count: 120 },
      ]),
      getTopCountriesBreakdown: jest.fn().mockResolvedValue([
        { code: 'HN', count: 1250 },
        { code: 'US', count: 110 },
        { code: 'ES', count: 40 },
      ]),
      getTopReferrersBreakdown: jest.fn().mockResolvedValue([
        { source: 'Direct / QR Scan', count: 1150 },
        { source: 'whatsapp.com', count: 180 },
        { source: 'instagram.com', count: 65 },
      ]),
    };

    linkStatsService = new LinkStatsService(
      linkRepositoryMock as unknown as ILinkRepository,
      linkEventRepositoryMock,
      planContextService,
    );
  });

  describe('LinkStatsService Orchestrator (Happy, Sad & Edge Cases)', () => {
    it('builds exact JSON output with summary, timeline, percentages and "Others" buckets', async () => {
      const result = await linkStatsService.getLinkStats(
        starterUser,
        targetLinkId,
      );

      expect(result).toEqual({
        linkId: 'b1b22e11-897c-48c9-9eb1-8848db929c8e',
        period: '7d',
        summary: {
          totalClicks: 1420,
          uniqueVisitors: 985,
          topCountry: 'HN',
          topDevice: 'iOS',
        },
        timeline: [
          { date: '2026-10-25', clicks: 140 },
          { date: '2026-10-26', clicks: 210 },
          { date: '2026-10-27', clicks: 185 },
          { date: '2026-10-28', clicks: 320 },
          { date: '2026-10-29', clicks: 290 },
          { date: '2026-10-30', clicks: 165 },
          { date: '2026-10-31', clicks: 110 },
        ],
        breakdowns: {
          os: [
            { name: 'iOS', count: 850, percentage: 59.86 },
            { name: 'Android', count: 470, percentage: 33.1 },
            { name: 'Windows', count: 75, percentage: 5.28 },
            { name: 'Others', count: 25, percentage: 1.76 },
          ],
          browsers: [
            { name: 'Mobile Safari', count: 780, percentage: 54.93 },
            { name: 'Chrome Mobile', count: 450, percentage: 31.69 },
            { name: 'Chrome', count: 120, percentage: 8.45 },
            { name: 'Others', count: 70, percentage: 4.93 },
          ],
          countries: [
            { code: 'HN', name: 'Honduras', count: 1250, percentage: 88.03 },
            {
              code: 'US',
              name: 'United States',
              count: 110,
              percentage: 7.75,
            },
            { code: 'ES', name: 'Spain', count: 40, percentage: 2.82 },
            { code: 'OT', name: 'Others', count: 20, percentage: 1.4 },
          ],
          referrers: [
            { source: 'Direct / QR Scan', count: 1150, percentage: 80.99 },
            { source: 'whatsapp.com', count: 180, percentage: 12.68 },
            { source: 'instagram.com', count: 65, percentage: 4.58 },
            { source: 'others', count: 25, percentage: 1.75 },
          ],
        },
      });
    });

    it('clamps requested period to 7d on STARTER plan while allowing up to 365d on PRO plan', async () => {
      const starterClamped = await linkStatsService.getLinkStats(
        starterUser,
        targetLinkId,
        '30d',
      );
      expect(starterClamped.period).toBe('7d');

      const pro30d = await linkStatsService.getLinkStats(
        proUser,
        targetLinkId,
        '30d',
      );
      expect(pro30d.period).toBe('30d');

      const pro365d = await linkStatsService.getLinkStats(
        proUser,
        targetLinkId,
        '365d',
      );
      expect(pro365d.period).toBe('365d');
    });

    it('handles zero-click links gracefully without division by zero', async () => {
      linkEventRepositoryMock.getTotalsAndUniqueVisitors.mockResolvedValueOnce({
        totalClicks: 0,
        uniqueVisitors: 0,
      });
      linkEventRepositoryMock.getDailyTimeline.mockResolvedValueOnce([]);
      linkEventRepositoryMock.getTopOsBreakdown.mockResolvedValueOnce([]);
      linkEventRepositoryMock.getTopBrowsersBreakdown.mockResolvedValueOnce([]);
      linkEventRepositoryMock.getTopCountriesBreakdown.mockResolvedValueOnce([]);
      linkEventRepositoryMock.getTopReferrersBreakdown.mockResolvedValueOnce([]);

      const emptyStats = await linkStatsService.getLinkStats(
        starterUser,
        targetLinkId,
      );

      expect(emptyStats.summary).toEqual({
        totalClicks: 0,
        uniqueVisitors: 0,
        topCountry: null,
        topDevice: null,
      });
      expect(emptyStats.timeline).toEqual([]);
      expect(emptyStats.breakdowns).toEqual({
        os: [],
        browsers: [],
        countries: [],
        referrers: [],
      });
    });

    it('rejects unauthorized access (IDOR) with NotFoundException and invalid period with BadRequestException', async () => {
      await expect(
        linkStatsService.getLinkStats(intruderUser, targetLinkId),
      ).rejects.toThrow(NotFoundException);

      await expect(
        linkStatsService.getLinkStats(starterUser, targetLinkId, 'invalid'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        linkStatsService.getLinkStats(starterUser, targetLinkId, '0d'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        linkStatsService.getLinkStats(proUser, targetLinkId, '500d'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('TypeOrmLinkEventRepository SQL QueryBuilder', () => {
    it('constructs indexed SQL queries with COALESCE(NULLIF(...)) and LIMIT 5', async () => {
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalClicks: '150',
          uniqueVisitors: '90',
        }),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      const ormRepoMock = {
        createQueryBuilder: jest.fn(() => qbMock),
      };

      const repo = new TypeOrmLinkEventRepository(ormRepoMock as never);
      const startDate = new Date('2026-10-25T00:00:00.000Z');

      const totals = await repo.getTotalsAndUniqueVisitors(
        targetLinkId,
        startDate,
      );
      expect(totals).toEqual({ totalClicks: 150, uniqueVisitors: 90 });
      expect(qbMock.where).toHaveBeenCalledWith(
        'event.link_id = :linkId AND event.scanned_at >= :startDate',
        { linkId: targetLinkId, startDate },
      );

      qbMock.getRawMany.mockResolvedValueOnce([
        { date: '2026-10-25', clicks: '45' },
      ]);
      await expect(
        repo.getDailyTimeline(targetLinkId, startDate),
      ).resolves.toEqual([{ date: '2026-10-25', clicks: 45 }]);

      qbMock.getRawMany.mockResolvedValueOnce([{ name: 'iOS', count: '100' }]);
      await expect(
        repo.getTopOsBreakdown(targetLinkId, startDate),
      ).resolves.toEqual([{ name: 'iOS', count: 100 }]);

      qbMock.getRawMany.mockResolvedValueOnce([
        { name: 'Chrome', count: '80' },
      ]);
      await expect(
        repo.getTopBrowsersBreakdown(targetLinkId, startDate),
      ).resolves.toEqual([{ name: 'Chrome', count: 80 }]);

      qbMock.getRawMany.mockResolvedValueOnce([{ code: 'HN', count: '120' }]);
      await expect(
        repo.getTopCountriesBreakdown(targetLinkId, startDate),
      ).resolves.toEqual([{ code: 'HN', count: 120 }]);

      qbMock.getRawMany.mockResolvedValueOnce([
        { source: 'Direct / QR Scan', count: '110' },
      ]);
      await expect(
        repo.getTopReferrersBreakdown(targetLinkId, startDate),
      ).resolves.toEqual([{ source: 'Direct / QR Scan', count: 110 }]);
      expect(qbMock.select).toHaveBeenCalledWith(
        "COALESCE(NULLIF(event.referer, ''), 'Direct / QR Scan')",
        'source',
      );
      expect(qbMock.limit).toHaveBeenCalledWith(5);
    });
  });
});
