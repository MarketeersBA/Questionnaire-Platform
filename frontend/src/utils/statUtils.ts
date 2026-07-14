/**
 * Advanced Statistical Utilities for Survey Research
 * Includes Z-tests with Yates Correction for small samples (N < 30)
 */

export interface SigResult {
    isSignificant: boolean;
    level: 0 | 1 | 2 | 3; // 0: None, 1: 80% (★), 2: 95% (★★), 3: 99% (★★★)
    zScore: number;
    pValue: number;
}

/**
 * Calculates Z-score for two proportions with optional continuity correction.
 * @param p1_pct Proportion 1 in percentage (0-100)
 * @param n1 Sample size 1
 * @param p2_pct Proportion 2 in percentage (0-100)
 * @param n2 Sample size 2
 * @param useCorrection Whether to use Yates's continuity correction (recommended for small N)
 */
export const calculateProportionSig = (
    p1_pct: number,
    n1: number,
    p2_pct: number,
    n2: number,
    useCorrection: boolean = true
): SigResult => {
    if (!n1 || !n2 || n1 < 2 || n2 < 2) {
        return { isSignificant: false, level: 0, zScore: 0, pValue: 1 };
    }

    const p1 = p1_pct / 100;
    const p2 = p2_pct / 100;

    // Pooled proportion
    const p = (n1 * p1 + n2 * p2) / (n1 + n2);

    // Standard Error
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));

    if (se === 0) {
        return { isSignificant: false, level: 0, zScore: 0, pValue: 1 };
    }

    let diff = Math.abs(p1 - p2);

    // Apply Yates's continuity correction for small samples
    if (useCorrection && (n1 < 30 || n2 < 30)) {
        const correction = (1 / n1 + 1 / n2) / 2;
        diff = Math.max(0, diff - correction);
    }

    const z = diff / se;

    // Significance Levels (Two-Tailed)
    let level: 0 | 1 | 2 | 3 = 0;
    if (z > 2.576) level = 3;      // 99%
    else if (z > 1.96) level = 2;   // 95%
    else if (z > 1.28) level = 1;   // 80% (Directional/Suggestive for N=10 cases)

    return {
        isSignificant: level > 0,
        level,
        zScore: z,
        pValue: 0, // Placeholder for p-value calculation if needed
    };
};
