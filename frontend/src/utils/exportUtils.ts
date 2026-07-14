/**
 * Advanced Export Utilities for the Questioner Platform
 * Handles standardized CSV generation and browser-level file streaming.
 */

interface CSVColumn {
    header: string;
    key: string;
    transform?: (val: any) => string;
}

/**
 * Generates a CSV string from an array of objects.
 * Handles escaping and standard comma-separated formatting.
 */
export const generateCSV = (data: any[], columns: CSVColumn[]): string => {
    if (!data.length) return '';

    // Create Headers
    const headers = columns.map(col => `"${col.header.replace(/"/g, '""')}"`).join(',');

    // Create Rows
    const rows = data.map(item => {
        return columns.map(col => {
            let val = item[col.key];
            if (col.transform) {
                val = col.transform(val);
            }

            const stringVal = val === null || val === undefined ? '' : String(val);
            // Escape double quotes and wrap in quotes
            return `"${stringVal.replace(/"/g, '""')}"`;
        }).join(',');
    });

    return [headers, ...rows].join('\n');
};

/**
 * Triggers a browser download of a file with the specified content.
 */
export const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

/**
 * Standard survey links export formatter
 */
export const exportSurveyLinks = (tokens: string[], baseUrl: string, format: 'csv' | 'txt', surveyId: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `survey-links-${surveyId.slice(-6)}-${timestamp}`;

    if (format === 'csv') {
        const data = tokens.map((t, idx) => ({ index: idx + 1, url: `${baseUrl}/s/${t}` }));
        const columns = [
            { header: 'Index', key: 'index' },
            { header: 'Survey Link', key: 'url' }
        ];
        const content = generateCSV(data, columns);
        downloadFile(content, `${filename}.csv`, 'text/csv;charset=utf-8;');
    } else {
        const content = tokens.map(t => `${baseUrl}/s/${t}`).join('\n');
        downloadFile(content, `${filename}.txt`, 'text/plain;charset=utf-8;');
    }
};

/**
 * Advanced token export with full metadata
 */
export const exportTokens = (tokenData: any[], baseUrl: string, format: 'csv' | 'txt', surveyName: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `tokens-${surveyName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`;

    if (format === 'csv') {
        const columns = [
            { header: 'Token Link', key: 'url' },
            { header: 'Status', key: 'status' },
            { header: 'Batch ID', key: 'batch_id' },
            { header: 'Created At', key: 'created_at' },
            { header: 'Last Accessed', key: 'last_accessed' }
        ];

        const data = tokenData.map(t => ({
            ...t,
            url: `${baseUrl}/s/${t.token || t.token_str}`
        }));

        const content = generateCSV(data, columns);
        downloadFile(content, `${filename}.csv`, 'text/csv;charset=utf-8;');
    } else {
        const content = tokenData.map(t => `${baseUrl}/s/${t.token || t.token_str}`).join('\n');
        downloadFile(content, `${filename}.txt`, 'text/plain;charset=utf-8;');
    }
};
