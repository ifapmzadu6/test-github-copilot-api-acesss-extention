import { isRecord } from './guards.js';

export const extractOutputText = (data: unknown): string => {
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
