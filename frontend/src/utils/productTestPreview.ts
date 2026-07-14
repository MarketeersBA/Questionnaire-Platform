import { generateProductTestModuleSchema } from './productTestGenerator';
import type { ProductTestBrandContextInput } from '../types/productTestRespondent';
import type { ProductTestConfig, ProductTestQuestion, PackageTestQuestion } from '../types/productTest';

export interface L2PreviewSection {
    title: string;
    questionCount: number;
    module?: string;
    timing?: string;
    brand?: string;
    displayBrand?: string;
}

export interface ProductTestL2Preview {
    sections: L2PreviewSection[];
    totalQuestions: number;
    sectionCount: number;
    phaseCount: number;
    brandCount: number;
}

/**
 * Client-side preview of expected product test snapshot (timing-phase wizard).
 */
export function buildProductTestL2Preview(
    config: ProductTestConfig,
    productQuestions: ProductTestQuestion[],
    packageQuestions: PackageTestQuestion[] = [],
    brandContextInput?: ProductTestBrandContextInput | null,
): ProductTestL2Preview {
    const { product_test_snapshot: snapshot } = generateProductTestModuleSchema(
        config,
        productQuestions,
        packageQuestions,
        brandContextInput,
    );

    const sections = snapshot.phases.flatMap((phase) =>
        phase.sections.map((section) => ({
            title: section.title,
            questionCount: section.questions.length,
            module: section.module,
            timing: phase.timing,
            brand: section.brand,
            displayBrand: section.displayBrand,
        })),
    );

    return {
        sections,
        totalQuestions: snapshot.meta.totalQuestions,
        sectionCount: snapshot.meta.sectionCount,
        phaseCount: snapshot.meta.phaseCount,
        brandCount: snapshot.brand_context?.brands?.length ?? snapshot.meta.brandCount ?? 0,
    };
}
