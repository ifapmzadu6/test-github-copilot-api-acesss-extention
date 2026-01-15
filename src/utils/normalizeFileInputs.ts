import type { ChatFileInput } from '../types.js';
import { isRecord, toTrimmedString } from './guards.js';

const ensureDataUrl = (data: string, mimeType?: string): string => {
  if (data.startsWith('data:')) {
    return data;
  }
  const safeType = mimeType && mimeType.trim() ? mimeType.trim() : 'application/octet-stream';
  return `data:${safeType};base64,${data}`;
};

export const normalizeFileInputs = (value: unknown): ChatFileInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const results: ChatFileInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const data = toTrimmedString(item.data) ?? toTrimmedString(item.file_data);
    if (!data) {
      continue;
    }
    const type = toTrimmedString(item.type) ?? undefined;
    const dataUrl = ensureDataUrl(data, type);

    results.push({
      data: dataUrl,
      name: toTrimmedString(item.name) ?? undefined,
      type,
      size: typeof item.size === 'number' ? item.size : undefined
    });
  }
  return results;
};
