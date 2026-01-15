import type { ChatFileInput } from '../types.js';
import { isRecord, toTrimmedString } from './guards.js';

const stripDataUrlPrefix = (value: string): string => {
  if (!value.startsWith('data:')) {
    return value;
  }
  const marker = 'base64,';
  const index = value.indexOf(marker);
  if (index === -1) {
    return value;
  }
  return value.slice(index + marker.length);
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
    const rawData = toTrimmedString(item.data) ?? toTrimmedString(item.file_data);
    if (!rawData) {
      continue;
    }
    const data = stripDataUrlPrefix(rawData);

    results.push({
      data,
      name: toTrimmedString(item.name) ?? undefined,
      type: toTrimmedString(item.type) ?? undefined,
      size: typeof item.size === 'number' ? item.size : undefined
    });
  }
  return results;
};
