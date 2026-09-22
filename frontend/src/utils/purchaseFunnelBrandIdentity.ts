/**
 * Purchase-funnel brands carry both an English and an Arabic name
 * (`{ name_en, name_ar }`) precisely so the same brand displays correctly
 * regardless of respondent language. Both fields used to get set to whatever
 * the creator typed once — `{ name_en: name, name_ar: name }` — so an
 * English entry's `name_ar` was literally English text, and vice versa. On
 * top of that, "is this brand already in the list" only ever compared
 * `name_en` with a case-sensitive exact match, so "Pepsi" / "pepsi" (let
 * alone the same brand typed in Arabic) all landed as separate brands.
 *
 * None of this can reliably tell "Pepsi" and "بيبسي" are the same brand on
 * its own — that needs either a translation dictionary or an AI call, and
 * this platform has neither wired up for brand names. What it *can* do,
 * which is most of the actual harm here: stop writing the wrong text into
 * the wrong field, stop missing same-script duplicates the exact-match check
 * was blind to (case, whitespace, a brand already known from the taste
 * test), and make the Arabic name visible/editable so a creator who *does*
 * notice two chips for one brand can fix it in a few seconds instead of
 * never being shown `name_ar` at all.
 */

const ARABIC_CHARS = /[\u0600-\u06FF]/;

export interface PurchaseFunnelBrand {
    name_en: string;
    name_ar: string;
}

/** Which field a freshly typed brand name belongs in, by its own script. */
export function isArabicText(value: string): boolean {
    return ARABIC_CHARS.test(value);
}

/**
 * Build a `{name_en, name_ar}` entry from one typed string, putting it in the
 * field its script actually belongs to instead of duplicating it into both.
 * The other field starts empty — call `mergeBrandName` if a value for it
 * turns up later (a sync from the taste-test list, or the creator filling in
 * the other language) rather than overwriting a name someone already typed.
 */
export function brandFromTypedName(raw: string): PurchaseFunnelBrand {
    const name = raw.trim();
    return isArabicText(name) ? { name_en: '', name_ar: name } : { name_en: name, name_ar: '' };
}

function normalizeKey(value: string): string {
    return value.trim().toLowerCase();
}

/** Every non-empty identity a brand entry is known by, normalized. */
function keysFor(brand: PurchaseFunnelBrand): string[] {
    return [brand.name_en, brand.name_ar].map(normalizeKey).filter(Boolean);
}

/**
 * The existing funnel entry this name already refers to, if any — matched
 * case/whitespace-insensitively against *either* of its two fields, so a
 * duplicate is caught whichever field it was originally filed under.
 */
export function findMatchingBrand(
    list: PurchaseFunnelBrand[],
    candidateName: string,
): PurchaseFunnelBrand | undefined {
    const key = normalizeKey(candidateName);
    if (!key) return undefined;
    return list.find((b) => keysFor(b).includes(key));
}

/**
 * Fill in whichever of `name_en` / `name_ar` a brand is still missing, from
 * a second name that just became available (e.g. syncing the taste test's
 * English name onto a funnel entry a respondent or creator already added in
 * Arabic). Never overwrites a field that already holds something — merging
 * is additive, not a silent rename.
 */
export function mergeBrandName(brand: PurchaseFunnelBrand, newName: string): PurchaseFunnelBrand {
    const name = newName.trim();
    if (!name) return brand;
    if (isArabicText(name)) {
        return brand.name_ar ? brand : { ...brand, name_ar: name };
    }
    return brand.name_en ? brand : { ...brand, name_en: name };
}

/**
 * Add one typed brand name to a funnel brand list: reuse an existing entry
 * (filling in its missing language from this name) rather than creating a
 * parallel one, or append a fresh entry when it's genuinely new.
 */
export function addBrandName(
    list: PurchaseFunnelBrand[],
    rawName: string,
): { list: PurchaseFunnelBrand[]; matchedExisting: boolean } {
    const name = rawName.trim();
    if (!name) return { list, matchedExisting: false };

    const existing = findMatchingBrand(list, name);
    if (existing) {
        return {
            list: list.map((b) => (b === existing ? mergeBrandName(b, name) : b)),
            matchedExisting: true,
        };
    }
    return { list: [...list, brandFromTypedName(name)], matchedExisting: false };
}
