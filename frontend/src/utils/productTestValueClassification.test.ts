import { describe, expect, it } from 'vitest';
import {
    classifyProductTestEvaluationValue,
    isScalarProductTestValueKind,
} from './productTestValueClassification';

describe('productTestValueClassification', () => {
    it('classifies media references separately from scalars', () => {
        const ref = {
            asset_id: 'asset-1',
            media_type: 'video' as const,
            mime: 'video/mp4',
            size_bytes: 100,
            uploaded_at: '2026-01-01T00:00:00Z',
        };
        const kind = classifyProductTestEvaluationValue(ref, {
            module: 'trial_media_capture',
            questionType: 'media-upload',
        });
        expect(kind).toBe('media_reference');
        expect(isScalarProductTestValueKind(kind)).toBe(false);
    });

    it('classifies numeric scores', () => {
        expect(classifyProductTestEvaluationValue(4, { module: 'product_test' })).toBe('scalar_numeric');
        expect(isScalarProductTestValueKind('scalar_numeric')).toBe(true);
    });
});
