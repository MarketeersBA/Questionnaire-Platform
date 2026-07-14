/** Analysts and admins may edit Structural Blueprint question copy and answer options. */
export function canEditStructuralBlueprint(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'analyst';
}

export const BLUEPRINT_LOCKED_LAYERS = ['taste_test', 'product_test', 'brand_analyzer'] as const;

export function isBlueprintLayerReadOnly(
    activeLayer: string,
    role: string | null | undefined,
): boolean {
    if (canEditStructuralBlueprint(role)) return false;
    return (BLUEPRINT_LOCKED_LAYERS as readonly string[]).includes(activeLayer);
}
