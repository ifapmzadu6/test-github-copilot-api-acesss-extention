import { isRecord } from './guards.js';

const extractChatCompletionText = (data: unknown): string | null => {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return null;
  }

  const parts: string[] = [];
  for (const choice of data.choices) {
    if (!isRecord(choice)) {
      continue;
    }
    let choiceHasText = false;
    const message = choice.message;
    if (!isRecord(message)) {
      continue;
    }
    const content = message.content;
    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (trimmed) {
        parts.push(trimmed);
        choiceHasText = true;
      }
    } else if (Array.isArray(content)) {
      for (const entry of content) {
        if (!isRecord(entry)) {
          continue;
        }
        if (entry.type === 'text' && typeof entry.text === 'string') {
          parts.push(entry.text);
          choiceHasText = true;
        }
      }
    }
    if (!choiceHasText) {
      const refusal = message.refusal;
      if (typeof refusal === 'string' && refusal.trim()) {
        parts.push(refusal.trim());
      }
    }
  }

  return parts.join('\n').trim();
};

export const extractOutputText = (data: unknown): string => {
  const chatText = extractChatCompletionText(data);
  if (chatText !== null) {
    return chatText;
  }

  if (isRecord(data) && typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = isRecord(data) ? data.output : null;
  if (!Array.isArray(output)) {
    return '';
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }
    const content = item.content;
    if (typeof content === 'string') {
      parts.push(content);
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const entry of content) {
      if (!isRecord(entry)) {
        continue;
      }
      const entryType = entry.type;
      const text = entry.text;
      if (typeof text === 'string' && (entryType === 'output_text' || entryType === 'text')) {
        parts.push(text);
      }
    }
  }

  return parts.join('\n').trim();
};
