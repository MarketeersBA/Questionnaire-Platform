import { describe, expect, it } from 'vitest';
import {
    localizeTasteTestAttribute,
    localizeTasteTestSectionTitle,
} from './tasteTestAttributeLabels';

describe('tasteTestAttributeLabels', () => {
    it('returns English labels unchanged', () => {
        expect(localizeTasteTestAttribute('Appearance', 'en')).toBe('Appearance');
        expect(localizeTasteTestSectionTitle('BrandA: Taste Profile', 'Taste Profile', 'en')).toBe(
            'BrandA: Taste Profile',
        );
    });

    it('localizes known attributes to Arabic', () => {
        expect(localizeTasteTestAttribute('Appearance', 'ar')).toBe('المظهر');
        expect(localizeTasteTestAttribute('Taste Profile', 'ar')).toBe('خصائص الطعم');
        expect(localizeTasteTestAttribute('Texture Profile', 'ar')).toBe('خصائص القوام');
        expect(localizeTasteTestAttribute('After Taste', 'ar')).toBe('بعد التذوق');
    });

    it('localizes section titles for existing English snapshots', () => {
        expect(
            localizeTasteTestSectionTitle('BrandA: Appearance', 'Appearance', 'ar'),
        ).toBe('BrandA: المظهر');
        expect(
            localizeTasteTestSectionTitle('BrandA: Taste Profile', undefined, 'ar'),
        ).toBe('BrandA: خصائص الطعم');
    });

    it('leaves unknown custom attributes unchanged', () => {
        expect(localizeTasteTestAttribute('My Custom Attr', 'ar')).toBe('My Custom Attr');
    });
});
