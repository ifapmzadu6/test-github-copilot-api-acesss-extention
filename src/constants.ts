export const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
export const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
export const DEFAULT_MODEL = 'gpt-5-mini';
export const GITHUB_SCOPES = ['read:user'] as const;

export const HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'Editor-Version': 'vscode/1.99.3',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat',
  'Copilot-Vision-Request': 'true'
} as const;
