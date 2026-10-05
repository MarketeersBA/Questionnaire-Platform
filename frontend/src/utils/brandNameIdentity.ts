/**
 * Deciding whether two brand-name strings refer to the same brand, across
 * English and Arabic script, with no network call — this runs on every
 * keystroke of a respondent's "Other" answer and every brand-list render, so
 * it has to be synchronous and fast.
 *
 * A dictionary or translation API is the *reliable* way to know "Pepsi" and
 * "بيبسي" name the same brand, and this project has neither wired up for
 * brand names. What's implemented here instead is a much older, well-proven
 * technique for exactly this problem: reduce each name to its *consonant
 * skeleton* — the sequence of consonant sounds with vowels dropped — and
 * compare those. Two spellings of the same brand, in any script, share
 * almost the same consonant sounds even when the vowels are transliterated
 * quite differently (Arabic often omits short vowels in writing entirely).
 * "Squizz" and "سكويز" both reduce to "SKZ"; "Vodafone" and "فودافون" both
 * reduce to "FDFN".
 *
 * This is a heuristic, not a translator — it does not know that "Coke" and
 * "Cola" are related, or that "Nike" isn't pronounced "nyke". What it's
 * built and tuned for is the actual case this keeps happening: the *same*
 * brand name, carried across scripts by someone typing what they hear,
 * which is a transliteration problem, not a translation one — and that's a
 * problem consonant skeletons are good at.
 */

/**
 * Latin letter -> phonetic class. Classes fold letters Arabic can't tell
 * apart when writing a loanword (Arabic has no native P, so "Pepsi" is
 * routinely written with ب/B) — folding both sides onto the same class is
 * what lets the comparison see through that substitution instead of being
 * defeated by it. Classes are single characters purely so a skeleton is a
 * plain string; the letters themselves carry no meaning.
 */
const LATIN_CLASS: Record<string, string> = {
    b: 'B', p: 'B',
    t: 'T',
    d: 'D',
    f: 'F', v: 'F',
    k: 'K', q: 'K', c: 'K', // "c" defaults hard (Kiri, Cola); soft "c" (Pepsi's "ps" has none) is rare in brand names
    g: 'G', j: 'G', // Egyptian colloquial reads ج as a hard "g" — matches this platform's other Arabic copy
    s: 'S', x: 'S', // English "x" (ks) collapses to its dominant sibilant for this purpose
    z: 'Z',
    h: 'H',
    r: 'R',
    l: 'L',
    m: 'M',
    n: 'N',
    w: '', y: '', // semivowels — dropped, same as the vowels they stand in for
    a: '', e: '', i: '', o: '', u: '',
};

/** Arabic letter -> the same phonetic-class alphabet as LATIN_CLASS. */
const ARABIC_CLASS: Record<string, string> = {
    'ب': 'B', 'پ': 'B',
    'ت': 'T', 'ط': 'T',
    'د': 'D', 'ض': 'D',
    'ف': 'F',
    'ك': 'K', 'ق': 'K',
    'ج': 'G', 'چ': 'G', 'غ': 'G', 'گ': 'K',
    'س': 'S', 'ص': 'S', 'ث': 'S', // ث is often written س or ت in Egyptian colloquial; س is the more common of the two
    'ز': 'Z', 'ذ': 'Z', 'ژ': 'Z',
    'ش': 'S', // folded onto the same class as س/ص — sh and s are the two Arabic renders of English "s"-ish sounds
    'ح': 'H', 'خ': 'H', 'ه': 'H',
    'ر': 'R',
    'ل': 'L',
    'م': 'M',
    'ن': 'N',
    // Vowel carriers, the tashkeel marks, and the glottal/pharyngeal letters
    // that have no Latin consonant equivalent all drop, same as Latin vowels.
    'ا': '', 'أ': '', 'إ': '', 'آ': '', 'ى': '', 'ة': '', 'ء': '', 'ع': '',
    'و': '', 'ي': '',
};

function collapseAdjacentDuplicates(s: string): string {
    let out = '';
    for (const ch of s) {
        if (ch !== out[out.length - 1]) out += ch;
    }
    return out;
}

/** The consonant-class skeleton of one brand name, script-agnostic. */
export function brandPhoneticSkeleton(rawName: string): string {
    // The Arabic definite article "ال" is routinely present or absent on the
    // same brand name depending on who typed it and how formal they were
    // feeling ("عبور" vs "العبور", both "Obour" in Latin) — it's a grammatical
    // prefix, not part of the brand's identity, so it's stripped before the
    // name is broken into sounds rather than left to surface as an extra
    // leading consonant that makes two spellings of the same brand look like
    // two different, unrelated brands.
    const withoutArticle = rawName.replace(/^ال/u, '');
    let classes = '';
    for (const ch of withoutArticle.toLowerCase()) {
        const cls = ARABIC_CLASS[ch] ?? LATIN_CLASS[ch] ?? '';
        classes += cls;
    }
    return collapseAdjacentDuplicates(classes);
}

/** Small, dependency-free edit distance — skeletons are a handful of characters. */
function levenshtein(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dist: number[] = new Array(rows * cols);
    for (let i = 0; i < rows; i++) dist[i * cols] = i;
    for (let j = 0; j < cols; j++) dist[j] = j;
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dist[i * cols + j] = Math.min(
                dist[(i - 1) * cols + j] + 1,
                dist[i * cols + (j - 1)] + 1,
                dist[(i - 1) * cols + (j - 1)] + cost,
            );
        }
    }
    return dist[rows * cols - 1];
}

// Below this skeleton length, even a single-character edit distance is too
// easy to hit by coincidence between two genuinely different short brand
// names ("Kiri" -> "KR" is one edit away from "Kiki" -> "K") — require an
// exact skeleton match there. Longer skeletons carry enough information that
// one differing consonant (a transliteration choice, not a different brand)
// is safe to tolerate.
const FUZZY_MIN_SKELETON_LENGTH = 4;
const MAX_EDIT_DISTANCE = 1;

/**
 * Whether two brand names likely refer to the same brand — same spelling
 * (case/whitespace-insensitive), or a same-brand transliteration across
 * English and Arabic script.
 */
export function isSameBrand(a: string, b: string): boolean {
    const left = a.trim();
    const right = b.trim();
    if (!left || !right) return false;
    if (left.toLowerCase() === right.toLowerCase()) return true;

    const skelA = brandPhoneticSkeleton(left);
    const skelB = brandPhoneticSkeleton(right);
    if (!skelA || !skelB) return false;
    if (skelA === skelB) return true;

    const longest = Math.max(skelA.length, skelB.length);
    if (longest < FUZZY_MIN_SKELETON_LENGTH) return false;
    return levenshtein(skelA, skelB) <= MAX_EDIT_DISTANCE;
}

const ARABIC_CHARS = /[؀-ۿ]/;

/** Whether a name is written in Arabic script rather than Latin. */
function isArabicScript(value: string): boolean {
    return ARABIC_CHARS.test(value);
}

/**
 * Merge brand-name lists into one, collapsing the same brand written twice.
 *
 * The phonetic comparison is applied **only across scripts**. That is the line
 * between the two cases this has to get right:
 *
 *   - "Squizz" and "سكويز" are one brand transliterated — different scripts,
 *     so the phonetic match is trusted and they collapse to one option.
 *   - "Almarai" and "Lamar" are two different brands — both Latin, both typed
 *     deliberately by the creator, and they must stay separate even though
 *     their consonant skeletons are identical (`LMR`). Same for Juhayna /
 *     Johnny (`GHN`) and Mirinda / Miranda (`MRND`), all real pairs that sit
 *     in one study.
 *
 * Comparing within a single script is where the heuristic did damage: a
 * skeleton cannot tell those pairs apart, so the two brands merged into one
 * option, a respondent could not pick one of them at all, and its answers were
 * credited to the other. Across scripts there is no such ambiguity to begin
 * with — nobody types the same brand twice in two alphabets by accident.
 *
 * A cross-script name that matches more than one kept brand is kept as its own
 * entry rather than guessed at.
 */
export function dedupeBrandNames(...lists: (string[] | undefined)[]): string[] {
    const merged: string[] = [];
    for (const list of lists) {
        for (const raw of list || []) {
            const name = (raw ?? '').trim();
            if (!name) continue;

            const lower = name.toLowerCase();
            if (merged.some((kept) => kept.toLowerCase() === lower)) continue;

            const transliterations = merged.filter(
                (kept) => isArabicScript(kept) !== isArabicScript(name) && isSameBrand(kept, name),
            );
            if (transliterations.length === 1) continue;

            merged.push(name);
        }
    }
    return merged;
}

/**
 * The one brand in `knownBrands` that `typed` refers to, or undefined.
 *
 * For canonicalizing something a respondent typed freehand — where the input is
 * unknown and the candidate set is known. Exact match wins outright; the
 * phonetic comparison is only consulted afterwards, and only when it points at
 * exactly ONE brand. An ambiguous result returns undefined rather than picking
 * the first hit, because guessing between two real brands silently files an
 * answer under the wrong one.
 */
export function matchTypedBrand(typed: string, knownBrands: string[]): string | undefined {
    const name = (typed ?? '').trim();
    if (!name) return undefined;

    const exact = knownBrands.find((b) => b.trim().toLowerCase() === name.toLowerCase());
    if (exact) return exact;

    const fuzzy = knownBrands.filter((b) => isSameBrand(b, name));
    return fuzzy.length === 1 ? fuzzy[0] : undefined;
}
