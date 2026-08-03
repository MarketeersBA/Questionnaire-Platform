/**
 * Arabic labels for taste-test main attributes (library + common custom names).
 * Keys are English names stored on surveys / master_questions.
 */
const TASTE_ATTRIBUTE_AR: Record<string, string> = {
    Appearance: 'المظهر',
    'Visual Appearance': 'المظهر البصري',
    Color: 'اللون',
    Odor: 'الرائحة',
    Aroma: 'الرائحة',
    'Aroma Profile': 'خصائص الرائحة',
    Texture: 'القوام',
    'Texture Profile': 'خصائص القوام',
    'Physical Texture': 'القوام الفيزيائي',
    'Taste Profile': 'خصائص الطعم',
    'Before Taste': 'قبل التذوق',
    'After Taste': 'بعد التذوق',
    Aftertaste: 'الطعم المتبقي',
    'Aftertaste & Finish': 'الطعم المتبقي والنهاية',
    'Overall Taste': 'الطعم العام',
    'Overall Likeness': 'الإعجاب العام',
    'Overall Satisfaction': 'الرضا العام',
    'Flavor Intensity': 'شدة النكهة',
    Mouthfeel: 'الإحساس في الفم',
    'Mouthfeel Experience': 'تجربة الإحساس في الفم',
    Freshness: 'الانتعاش',
    'Freshness Perception': 'الإحساس بالانتعاش',
    Authenticity: 'الأصالة',
    'Product Authenticity': 'أصالة المنتج',
};

/** Longer keys first so "Taste Profile" wins over partial matches. */
const ATTRIBUTE_KEYS_BY_LENGTH = Object.keys(TASTE_ATTRIBUTE_AR).sort(
    (a, b) => b.length - a.length,
);

export function localizeTasteTestAttribute(
    name: string | null | undefined,
    language: 'en' | 'ar' | string | undefined,
): string {
    if (!name) return '';
    if (language !== 'ar') return name;
    return TASTE_ATTRIBUTE_AR[name] || TASTE_ATTRIBUTE_AR[name.trim()] || name;
}

/**
 * Localize a taste-test section heading like "BrandX: Appearance".
 * Prefers `attribute` when present; otherwise replaces known English labels in the title.
 */
export function localizeTasteTestSectionTitle(
    title: string | null | undefined,
    attribute: string | null | undefined,
    language: 'en' | 'ar' | string | undefined,
): string {
    if (!title) return '';
    if (language !== 'ar') return title;

    if (attribute) {
        const localizedAttr = localizeTasteTestAttribute(attribute, 'ar');
        if (localizedAttr !== attribute && title.includes(attribute)) {
            return title.split(attribute).join(localizedAttr);
        }
    }

    let result = title;
    for (const en of ATTRIBUTE_KEYS_BY_LENGTH) {
        const ar = TASTE_ATTRIBUTE_AR[en];
        if (result.includes(en)) {
            result = result.split(en).join(ar);
        }
    }
    return result;
}
