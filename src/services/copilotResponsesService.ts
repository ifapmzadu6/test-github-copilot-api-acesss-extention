import OpenAI from 'openai';
import { BASE_HEADERS, COPILOT_API_BASE_URL, DEFAULT_INSTRUCTIONS } from '../constants.js';
import type { CopilotUsage, ConversationInput } from '../types.js';
import { isRecord } from '../utils/guards.js';
import { extractOutputText } from '../utils/responseParsing.js';
import { CopilotAuth } from './copilotAuth.js';

export class CopilotResponsesService {
  constructor(private readonly auth: CopilotAuth) {}

  async sendChat(
    model: string,
    input: ConversationInput,
    sessionId: string,
    requiresVision: boolean
  ): Promise<{ text: string; usage: CopilotUsage | null }> {
    const copilotToken = await this.auth.getCopilotToken();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const client = new OpenAI({
      apiKey: copilotToken,
      baseURL: COPILOT_API_BASE_URL,
      defaultHeaders: BASE_HEADERS
    });

    const requestHeaders: Record<string, string> = {
      'Copilot-Session-Id': sessionId,
      'Copilot-Client-Timezone': timezone
    };

    if (requiresVision) {
      requestHeaders['Copilot-Vision-Request'] = 'true';
    }

    const response = await client.responses.create(
      {
        model,
        input,
        instructions: DEFAULT_INSTRUCTIONS,
        stream: false
      },
      {
        headers: requestHeaders
      }
    );

    const usage =
      isRecord(response) && 'usage' in response
        ? ((response as { usage?: CopilotUsage }).usage ?? null)
        : null;

    return {
      text: extractOutputText(response),
      usage
    };
  }
}
