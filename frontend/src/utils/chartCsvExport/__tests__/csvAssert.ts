import { expect } from 'vitest';

/**
 * Lightweight CSV assertions for chart export verification tests.
 * Full RFC 4180 parsing is not required — we validate headers, row counts, and key cell values.
 */

export const csvLineCount = (content: string): number =>
    content.trim() === '' ? 0 : content.trim().split('\n').length;

export const csvHeaderLine = (content: string): string =>
    content.trim().split('\n')[0] ?? '';

export const csvDataRowCount = (content: string): number =>
    Math.max(0, csvLineCount(content) - 1);

export const csvIncludesCell = (content: string, value: string | number): boolean =>
    content.includes(String(value));

export const csvHeadersInclude = (content: string, ...headers: string[]): boolean => {
    const headerLine = csvHeaderLine(content);
    return headers.every((h) => headerLine.includes(`"${h}"`));
};

export const expectExportableCsv = (
    content: string,
    opts: { minDataRows: number; headers: string[]; sampleValues?: (string | number)[] }
) => {
    expect(csvDataRowCount(content)).toBeGreaterThanOrEqual(opts.minDataRows);
    expect(csvHeadersInclude(content, ...opts.headers)).toBe(true);
    opts.sampleValues?.forEach((v) => {
        expect(csvIncludesCell(content, v)).toBe(true);
    });
};
