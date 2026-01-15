import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

export type CopilotUsage = unknown;

export type ConversationInput = Exclude<
  NonNullable<ResponseCreateParamsNonStreaming['input']>,
  string
>;

export type ChatImageInput = {
  dataUrl: string;
  name?: string;
  type?: string;
  size?: number;
  detail?: 'low' | 'high' | 'auto';
};

export type WebviewIncomingMessage =
  | { type: 'ready' }
  | { type: 'signIn' }
  | { type: 'reset' }
  | { type: 'send'; text?: string; model?: string; images?: ChatImageInput[] };

export type WebviewOutgoingMessage =
  | { type: 'status'; authenticated: boolean; login: string | null }
  | { type: 'assistant'; text: string; model: string; usage: CopilotUsage | null }
  | { type: 'error'; message: string }
  | { type: 'cleared' };
