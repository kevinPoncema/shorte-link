import { ApiClient } from '../client/api-client';
import { LinkStatsResponse } from '../client/types';

export class StatsClientService {
  constructor(private readonly apiClient: ApiClient) {}

  public async getLinkStats(
    linkId: string,
    period: '7d' | '30d' | '90d' | '365d' = '7d',
  ): Promise<LinkStatsResponse> {
    const path = `/links/${encodeURIComponent(linkId)}/stats?period=${encodeURIComponent(period)}`;
    return this.apiClient.request<LinkStatsResponse>(path, { method: 'GET' });
  }
}
