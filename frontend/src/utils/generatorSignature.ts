import type { SurveyFormData } from '../pages/CreateSurvey/types';

/**
 * Fingerprint of the inputs that decide what `handleGenerateSchema` produces:
 * brand names, selected attributes, custom attributes, language, category.
 *
 * Used to tell a fresh generation apart from a stale one. The generator only
 * ran automatically on the *first* Parameters -> Blueprint transition ("Next").
 * Stepping back to Parameters, renaming a brand, then returning to the
 * Blueprint step via its tab (rather than "Next" again) took a different,
 * unguarded path — the tab bar treats any already-visited step as free
 * navigation and just switches `currentStep`, so the already-generated
 * questions kept whatever brand name they were built with. The section
 * *title* and other config-derived labels update immediately because they
 * read the live config; the question *text* does not, because it was already
 * baked into `schema.layer2_structure` — hence a section titled with the new
 * name over questions still written for the old one.
 *
 * Order-independent and whitespace/case-normalised so reordering the brand
 * list, or a stray space, doesn't register as a "change" and trigger a
 * needless regeneration.
 */
export function computeGeneratorSignature(formData: Pick<SurveyFormData, 'config' | 'product_test_config'>): string {
    const config = formData.config;
    const brandKey = (b: any): string => {
        const name = typeof b === 'string' ? b : (b?.name ?? '');
        return String(name).trim().toLowerCase();
    };

    const brands = [
        ...(config?.internal_brands_data ?? []),
        ...(config?.competitor_brands_data ?? []),
    ]
        .map(brandKey)
        .filter(Boolean)
        .sort();

    const attributes = Object.keys(config?.attributes ?? {})
        .map((k) => k.trim().toLowerCase())
        .sort();

    const customAttributes = (config?.custom_research_attributes ?? [])
        .map((c: any) => {
            const subLabels = (c?.sub_attributes ?? [])
                .map((s: any) => String(s?.label ?? '').trim().toLowerCase())
                .sort();
            return `${String(c?.main_attribute ?? '').trim().toLowerCase()}:${subLabels.join(',')}`;
        })
        .sort();

    const ptConfig = formData.product_test_config;
    const ptAttributes = [...(ptConfig?.selected_attributes ?? [])].map(String).sort();

    return JSON.stringify({
        brands,
        attributes,
        customAttributes,
        language: config?.language ?? '',
        category: (config?.category ?? '').trim().toLowerCase(),
        ptAttributes,
        ptLanguage: ptConfig?.language ?? '',
    });
}
