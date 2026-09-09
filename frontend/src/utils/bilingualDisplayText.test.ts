import { describe, expect, it } from 'vitest';
import { pickBilingualDisplayText } from './bilingualDisplayText';

describe('pickBilingualDisplayText', () => {
  it('returns monolingual text unchanged', () => {
    expect(pickBilingualDisplayText('18-25', 'en')).toBe('18-25');
    expect(pickBilingualDisplayText('18-25', 'ar')).toBe('18-25');
  });

  it('splits simple gender labels', () => {
    expect(pickBilingualDisplayText('Male / ذكر', 'en')).toBe('Male');
    expect(pickBilingualDisplayText('Male / ذكر', 'ar')).toBe('ذكر');
  });

  it('keeps internal slashes on each side for occupation', () => {
    const opt =
      'Company manager / High-skill professional (doctor, engineer) / Trader / Small business owner / University professor / مدير شركة / مهني عالي المهارة (طبيب، مهندس) / تاجر / صاحب مشروع صغير / أستاذ جامعي';
    expect(pickBilingualDisplayText(opt, 'en')).toBe(
      'Company manager / High-skill professional (doctor, engineer) / Trader / Small business owner / University professor',
    );
    expect(pickBilingualDisplayText(opt, 'ar')).toBe(
      'مدير شركة / مهني عالي المهارة (طبيب، مهندس) / تاجر / صاحب مشروع صغير / أستاذ جامعي',
    );
  });

  it('handles education labels with slashes in both languages', () => {
    const opt = 'Postgraduate (Masters / PhD) / دراسات عليا (ماجستير / دكتوراه)';
    expect(pickBilingualDisplayText(opt, 'en')).toBe('Postgraduate (Masters / PhD)');
    expect(pickBilingualDisplayText(opt, 'ar')).toBe('دراسات عليا (ماجستير / دكتوراه)');
  });
});
