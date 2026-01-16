import OpenAI from 'openai';
import { BASE_HEADERS, COPILOT_API_BASE_URL, DEFAULT_INSTRUCTIONS } from '../constants.js';
import type { CopilotApiMode, CopilotUsage, ConversationInput } from '../types.js';
import type {
  ResponseInput,
  ResponseInputMessageContentList
} from 'openai/resources/responses/responses';
import { isRecord } from '../utils/guards.js';
import { extractOutputText } from '../utils/responseParsing.js';
import { CopilotAuth } from './copilotAuth.js';

const isCodexModel = (model: string): boolean => model.toLowerCase().includes('codex');

const toResponseContentList = (parts: unknown[]): ResponseInputMessageContentList => {
  const content: ResponseInputMessageContentList = [];
  for (const part of parts) {
    if (!isRecord(part) || typeof part.type !== 'string') {
      continue;
    }
    switch (part.type) {
      case 'text': {
        const text = typeof part.text === 'string' ? part.text : '';
        if (text.trim()) {
          content.push({ type: 'input_text', text });
        }
        break;
      }
      case 'refusal': {
        const refusal = typeof part.refusal === 'string' ? part.refusal : '';
        if (refusal.trim()) {
          content.push({ type: 'input_text', text: refusal });
        }
        break;
      }
      case 'image_url': {
        const image = isRecord(part.image_url) ? part.image_url : null;
        const url = image && typeof image.url === 'string' ? image.url : null;
        if (!url) {
          break;
        }
        const detail =
          image && (image.detail === 'low' || image.detail === 'high' || image.detail === 'auto')
            ? image.detail
            : 'auto';
        content.push({
          type: 'input_image',
          image_url: url,
          detail
        });
        break;
      }
      case 'file': {
        const file = isRecord(part.file) ? part.file : null;
        const fileData = file && typeof file.file_data === 'string' ? file.file_data : undefined;
        const fileId = file && typeof file.file_id === 'string' ? file.file_id : undefined;
        const filename = file && typeof file.filename === 'string' ? file.filename : undefined;
        if (fileData || fileId) {
          content.push({
            type: 'input_file',
            file_data: fileData,
            file_id: fileId,
            filename
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return content;
};

const toResponseInput = (messages: ConversationInput): ResponseInput => {
  const input: ResponseInput = [];
  for (const message of messages) {
    if (
      message.role !== 'user' &&
      message.role !== 'assistant' &&
      message.role !== 'system' &&
      message.role !== 'developer'
    ) {
      continue;
    }

    const content = message.content;
    if (typeof content === 'string') {
      input.push({ role: message.role, content });
      continue;
    }
    if (Array.isArray(content)) {
      const parts = toResponseContentList(content);
      if (parts.length > 0) {
        input.push({ role: message.role, content: parts });
      }
    }
  }
  return input;
};

export class CopilotResponsesService {
  constructor(private readonly auth: CopilotAuth) {}

  async sendChat(
    model: string,
    input: ConversationInput,
    sessionId: string,
    requiresVision: boolean
  ): Promise<{ text: string; usage: CopilotUsage | null; apiMode: CopilotApiMode }> {
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

    const trimmedInstructions = DEFAULT_INSTRUCTIONS.trim();

    if (isCodexModel(model)) {
      const response = await client.responses.create(
        {
          model,
          input: toResponseInput(input),
          instructions: trimmedInstructions ? trimmedInstructions : null,
          stream: false
        },
        {
          headers: requestHeaders
        }
      );

      return {
        text: extractOutputText(response),
        usage: response.usage ?? null,
        apiMode: 'responses'
      };
    }

    const systemMessage: ConversationInput[number] = {
      role: 'system',
      content: trimmedInstructions
    };
    const messages: ConversationInput = trimmedInstructions
      ? [systemMessage, ...input]
      : [...input];

    const response = await client.chat.completions.create(
      {
        model,
        messages,
        stream: false
      },
      {
        headers: requestHeaders
      }
    );

    return {
      text: extractOutputText(response),
      usage: response.usage ?? null,
      apiMode: 'chat.completions'
    };
  }
}
