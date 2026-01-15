import OpenAI from 'openai';
import { COPILOT_API_BASE_URL, DEFAULT_INSTRUCTIONS, HEADERS } from '../constants.js';
import type { CopilotUsage, ConversationInput } from '../types.js';
import { isRecord } from '../utils/guards.js';
import { extractOutputText } from '../utils/responseParsing.js';
import { CopilotAuth } from './copilotAuth.js';

export class CopilotResponsesService {
  constructor(private readonly auth: CopilotAuth) {}

  async sendChat(
    model: string,
    input: ConversationInput,
    sessionId: string
  ): Promise<{ text: string; usage: CopilotUsage | null }> {
    const copilotToken = await this.auth.getCopilotToken();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const client = new OpenAI({
      apiKey: copilotToken,
      baseURL: COPILOT_API_BASE_URL,
      defaultHeaders: HEADERS
    });

    const response = await client.responses.create(
      {
        model,
        input,
        instructions: DEFAULT_INSTRUCTIONS,
        stream: false
      },
      {
        headers: {
          'Copilot-Session-Id': sessionId,
          'Copilot-Client-Timezone': timezone
        }
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
