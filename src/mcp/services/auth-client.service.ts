import { ApiClient } from '../client/api-client';
import { AuthLoginResponse, UserProfile } from '../client/types';

export class AuthClientService {
  constructor(private readonly apiClient: ApiClient) {}

  public async login(email?: string, password?: string): Promise<AuthLoginResponse> {
    return this.apiClient.login(email, password);
  }

  public async getProfile(): Promise<UserProfile> {
    return this.apiClient.request<UserProfile>('/auth/me', { method: 'GET' });
  }

  public async refreshToken(): Promise<UserProfile> {
    return this.apiClient.refreshToken();
  }

  public getSessionInfo() {
    return this.apiClient.getSessionInfo();
  }
}
