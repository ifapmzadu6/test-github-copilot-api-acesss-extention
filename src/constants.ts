export const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
export const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
export const DEFAULT_MODEL = 'gpt-5-mini';
export const DEFAULT_INSTRUCTIONS = 'You are a helpful assistant.';
export const GITHUB_SCOPES = ['read:user'] as const;

export const BASE_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'Editor-Version': 'vscode/1.99.3',
  'Openai-Intent': 'conversation-edits',
  'X-Initiator': 'user',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat'
} as const;
