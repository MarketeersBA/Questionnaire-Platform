import { describe, expect, it } from 'vitest';
import {
    classifyFileMediaType,
    isProductTestMediaAnswerComplete,
    isProductTestMediaAnswerReference,
    validateTrialMediaFile,
} from './productTestMediaAnswer';

describe('productTestMediaAnswer', () => {
    it('recognizes uploaded asset references', () => {
        const ref = {
            asset_id: 'abc123',
            media_type: 'image' as const,
            mime: 'image/jpeg',
            size_bytes: 1024,
            uploaded_at: '2026-01-01T00:00:00Z',
        };
        expect(isProductTestMediaAnswerReference(ref)).toBe(true);
        expect(isProductTestMediaAnswerComplete(ref)).toBe(true);
    });

    it('rejects incomplete media answers', () => {
        expect(isProductTestMediaAnswerComplete(null)).toBe(false);
        expect(isProductTestMediaAnswerComplete({ asset_id: '' })).toBe(false);
        expect(isProductTestMediaAnswerComplete({})).toBe(false);
    });

    it('validates client-side file type and size', () => {
        const limits = {
            acceptedMedia: 'image' as const,
            maxImageMb: 5,
            maxVideoMb: 25,
            maxVideoDurationSeconds: 60,
        };
        const image = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
        const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

        expect(validateTrialMediaFile(image, limits)).toBeNull();
        expect(validateTrialMediaFile(video, limits)).toMatch(/images only/i);
        expect(classifyFileMediaType(image)).toBe('image');
        expect(classifyFileMediaType(video)).toBe('video');
    });
});
