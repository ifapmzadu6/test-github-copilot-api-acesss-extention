import type { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ResponseUsage } from 'openai/resources/responses/responses';

export type CopilotUsage = ChatCompletion['usage'] | ResponseUsage;
export type CopilotApiMode = 'responses' | 'chat.completions';

export type ConversationInput = ChatCompletionMessageParam[];

export type ChatImageInput = {
  dataUrl: string;
  name?: string;
  type?: string;
  size?: number;
  detail?: 'low' | 'high' | 'auto';
};

export type ChatFileInput = {
  data: string;
  name?: string;
  type?: string;
  size?: number;
};

export type WebviewIncomingMessage =
  | { type: 'ready' }
  | { type: 'signIn' }
  | { type: 'reset' }
  | {
      type: 'send';
      text?: string;
      model?: string;
      images?: ChatImageInput[];
      files?: ChatFileInput[];
    };

export type WebviewOutgoingMessage =
  | { type: 'status'; authenticated: boolean; login: string | null }
  | {
      type: 'assistant';
      text: string;
      model: string;
      usage: CopilotUsage | null;
      apiMode: CopilotApiMode;
    }
  | { type: 'error'; message: string }
  | { type: 'cleared' };
