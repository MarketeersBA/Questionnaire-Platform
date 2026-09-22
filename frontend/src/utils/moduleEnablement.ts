/**
 * Whether an optional module runs for a respondent.
 *
 * Every module predicate used to end with a fallback like
 * `module_sequence.includes('brand_analyzer')`. That fallback exists for older
 * surveys saved before the `is_enabled` flags, but it was checked *after* the
 * flag and returned true on its own — so it silently overrode an explicit
 * `is_enabled: false`.
 *
 * `module_sequence` is the catalogue of every module in display order, not the
 * list of chosen ones, so it names modules the analyst never selected. The
 * result: a survey configured with only screening + taste test + purchase
 * funnel also ran Brand Analyzer, which had no attributes selected, rendered a
 * grid with zero rows, and was marked `required` — leaving the respondent on an
 * unanswerable screen with "يرجى اختيار إجابة للمتابعة" and no way to finish.
 *
 * An explicit `false` is a decision and must win over the legacy fallback.
 */
export function isModuleExplicitlyDisabled(survey: any, configKey: string): boolean {
    const config = survey?.[configKey];
    return Boolean(
        config
        && typeof config === 'object'
        && !Array.isArray(config)
        && config.is_enabled === false,
    );
}

/**
 * The legacy fallback: a survey with no `is_enabled` flag at all is treated as
 * enabled when the sequence names it. Only reached when nothing explicit exists.
 */
export function moduleSequenceIncludes(survey: any, moduleId: string): boolean {
    const sequence = survey?.config?.module_sequence || survey?.module_sequence || [];
    return Array.isArray(sequence) && sequence.includes(moduleId);
}
