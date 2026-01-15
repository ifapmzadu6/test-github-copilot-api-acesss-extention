import type * as vscode from 'vscode';
import { BASE_HEADERS, COPILOT_TOKEN_URL } from '../constants.js';

const TOKEN_REFRESH_BUFFER_MS = 60_000;

type CopilotTokenResponse = {
  token?: string;
  expires_at?: number | string;
  refresh_in?: number;
};

const parseCopilotExpiry = (data: CopilotTokenResponse): number => {
  if (typeof data.expires_at === 'number') {
    return data.expires_at * 1000;
  }

  if (typeof data.expires_at === 'string') {
    const parsed = Date.parse(data.expires_at);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (typeof data.refresh_in === 'number') {
    return Date.now() + data.refresh_in * 1000;
  }

  return Date.now() + 5 * 60 * 1000;
};

type SessionProvider = (
  createIfNone: boolean
) => Thenable<vscode.AuthenticationSession | undefined>;

export class CopilotAuth {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly sessionProvider: SessionProvider) {}

  async getSession(createIfNone: boolean): Promise<vscode.AuthenticationSession | undefined> {
    return this.sessionProvider(createIfNone);
  }

  async getCopilotToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.token;
    }

    const session = await this.sessionProvider(true);
    if (!session) {
      throw new Error('GitHub sign-in was canceled.');
    }

    const response = await fetch(COPILOT_TOKEN_URL, {
      method: 'GET',
      headers: {
        ...BASE_HEADERS,
        Authorization: `token ${session.accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Copilot token request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as CopilotTokenResponse;
    if (!data || !data.token) {
      throw new Error('Copilot token response missing token.');
    }

    this.token = data.token;
    this.tokenExpiresAt = parseCopilotExpiry(data);

    return this.token;
  }
}
