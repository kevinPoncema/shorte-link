import { ApiClient } from '../client/api-client';
import { LinkRecord, PaginatedLinks, QrVisualConfig } from '../client/types';

export interface CreateLinkInput {
  name: string;
  targetUrl: string;
  shortCode?: string;
  qrConfig?: QrVisualConfig;
}

export interface UpdateLinkInput {
  name?: string;
  targetUrl?: string;
  isActive?: boolean;
  qrConfig?: QrVisualConfig;
}

export interface ListLinksParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface QrCodeOutput {
  id: string;
  format: 'png' | 'svg';
  contentType: string;
  content: string; // SVG text or PNG base64
  dataUri?: string;
}

export class LinksClientService {
  constructor(private readonly apiClient: ApiClient) {}

  public async createLink(input: CreateLinkInput): Promise<LinkRecord> {
    return this.apiClient.request<LinkRecord>('/links', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  public async listLinks(params: ListLinksParams = {}): Promise<PaginatedLinks> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.search !== undefined && params.search.trim() !== '') query.set('search', params.search.trim());
    if (params.isActive !== undefined) query.set('isActive', String(params.isActive));

    const queryString = query.toString();
    const path = `/links${queryString ? `?${queryString}` : ''}`;
    return this.apiClient.request<PaginatedLinks>(path, { method: 'GET' });
  }

  public async getLinkById(id: string): Promise<LinkRecord> {
    return this.apiClient.request<LinkRecord>(`/links/${id}`, { method: 'GET' });
  }

  public async updateLink(id: string, input: UpdateLinkInput): Promise<LinkRecord> {
    return this.apiClient.request<LinkRecord>(`/links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  public async deleteLink(id: string): Promise<void> {
    await this.apiClient.request<void>(`/links/${id}`, { method: 'DELETE' });
  }

  public async getQrCode(id: string, format: 'svg' | 'png' = 'svg'): Promise<QrCodeOutput> {
    const { buffer, contentType } = await this.apiClient.requestBuffer(
      `/links/${id}/qr?format=${format}`,
      { method: 'GET' },
    );

    if (format === 'svg') {
      const svgText = buffer.toString('utf-8');
      return {
        id,
        format: 'svg',
        contentType: 'image/svg+xml',
        content: svgText,
      };
    } else {
      const base64 = buffer.toString('base64');
      return {
        id,
        format: 'png',
        contentType: 'image/png',
        content: base64,
        dataUri: `data:image/png;base64,${base64}`,
      };
    }
  }
}
