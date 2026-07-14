import { describe, expect, it } from 'vitest';
import {
    canEditStructuralBlueprint,
    isBlueprintLayerReadOnly,
} from './structuralBlueprintPermissions';

describe('structuralBlueprintPermissions', () => {
    it('allows admin and analyst to edit blueprint layers', () => {
        expect(canEditStructuralBlueprint('admin')).toBe(true);
        expect(canEditStructuralBlueprint('analyst')).toBe(true);
        expect(canEditStructuralBlueprint('client')).toBe(false);
    });

    it('locks taste/product/brand analyzer layers for non-analyst roles', () => {
        expect(isBlueprintLayerReadOnly('product_test', 'client')).toBe(true);
        expect(isBlueprintLayerReadOnly('product_test', 'analyst')).toBe(false);
        expect(isBlueprintLayerReadOnly('screening', 'client')).toBe(false);
    });
});
