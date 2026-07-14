import { ProductTestConfig, ProductTestQuestion, PackageTestQuestion } from '../types/productTest';
import type { ProductTestBrandContextInput } from '../types/productTestRespondent';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import { buildProductTestSnapshot, flattenSnapshotToLegacySections } from './productTestSnapshotBuilder';

export interface ProductTestModuleSchemaResult {
    layer1_structure: { sections: [] };
    layer2_structure: { sections: [] };
    product_test_snapshot: ProductTestSnapshot;
}

export function generateProductTestModuleSchema(
    config: ProductTestConfig,
    productQuestions: ProductTestQuestion[],
    packageQuestions: PackageTestQuestion[] = [],
    brandContextInput?: ProductTestBrandContextInput | null,
): ProductTestModuleSchemaResult {
    const snapshot = buildProductTestSnapshot(
        config,
        productQuestions,
        packageQuestions,
        new Date().toISOString(),
        brandContextInput,
    );

    return {
        layer1_structure: { sections: [] },
        layer2_structure: { sections: [] },
        product_test_snapshot: snapshot,
    };
}

/** @deprecated Use product_test_snapshot from generateProductTestModuleSchema. */
export function legacySectionsFromSnapshot(snapshot: ProductTestSnapshot) {
    return flattenSnapshotToLegacySections(snapshot);
}
