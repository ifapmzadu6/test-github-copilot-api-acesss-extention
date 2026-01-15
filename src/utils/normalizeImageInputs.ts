import type { ChatImageInput } from '../types.js';
import { isRecord, toTrimmedString } from './guards.js';

export const normalizeImageInputs = (value: unknown): ChatImageInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const results: ChatImageInput[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.startsWith('data:image/')) {
        results.push({ dataUrl: item });
      }
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    const dataUrl = toTrimmedString(item.dataUrl);
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      continue;
    }

    const detailRaw = toTrimmedString(item.detail);
    const detail =
      detailRaw === 'low' || detailRaw === 'high' || detailRaw === 'auto' ? detailRaw : undefined;

    results.push({
      dataUrl,
      detail,
      name: toTrimmedString(item.name) ?? undefined,
      type: toTrimmedString(item.type) ?? undefined,
      size: typeof item.size === 'number' ? item.size : undefined
    });
  }
  return results;
};
