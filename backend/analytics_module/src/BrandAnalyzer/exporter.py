import pandas as pd
from typing import Dict, Any, List
import io
import os
from . import calculations2 as calc

class BrandAnalyzerExcelExporter:
    """
    Orchestrates the generation of the 7-sheet Brand Analyzer Excel workbook.
    """

    @staticmethod
    def generate_excel(ctx: Dict[str, Any], output_path: str):
        """
        Takes the context prepared by aggregator and writes the 7-sheet workbook.
        """
    @staticmethod
    def generate_excel(ctx: Dict[str, Any], output_path: str):
        """
        [PHASE 4] Advanced Excel Generation (7 Sheets).
        Uses the high-performance pipeline results for consistent reporting across all delivery channels.
        """
        n_resps = ctx["n_resps"]
        n_brands = ctx["n_brands"]
        n_attrs = ctx["n_attrs"]
        
        # 1. Pipeline execution using optimized context
        scores_3d = np.array(ctx["scores_np"]) # [Resp x Attr x Brand]
        utility_matrix = np.array(ctx["utility_matrix"]) # [Resp x Brand]
        
        # Stage 4-5: Drivers & Correlations
        scores_transformed = calc.arr_transform(ctx["scores_matrix"], n_attrs, n_brands, n_resps)
        utility_1d = calc.arr_one_d(ctx["utility_matrix"], n_resps, n_brands)
        correlations = calc.corr_calc(scores_transformed, utility_1d, n_attrs, n_resps, n_brands)
        weighted_t = calc.wt_t_calc(correlations, n_attrs, n_resps)

        # Stage 6-9: Frequencies & Gaps (Vectorized NumPy Operations)
        freq_matrix = scores_3d.sum(axis=0).astype(np.float32) # [Attr x Brand]
        grand_total = freq_matrix.sum()
        
        if grand_total == 0:
            return None

        # Marginal Probabilities for the Independence Model
        p_attr = freq_matrix.sum(axis=1) / grand_total
        p_brand = freq_matrix.sum(axis=0) / grand_total
        
        # Independence Model calculations
        expected = calc.get_expected_attribute_score(p_attr.tolist(), p_brand.tolist(), n_attrs, n_brands, grand_total)
        gap = calc.get_expected_attribute_share_from_check(freq_matrix.tolist(), expected, n_attrs, n_brands)
        norm_gap = calc.get_normalize_expected_attribute_share(gap, n_attrs, n_brands)
        
        # Stage 10+: CBI Logic
        freq_pct = (freq_matrix / n_resps * 100.0).tolist()
        cbi_scores = calc.calc_cbi(norm_gap, freq_pct, weighted_t, n_attrs, n_brands)

        # Strategic Positioning (POP/POD/Strong/Unassoc)
        df_poppod = calc.pop_pod_str_unass(
            list(range(n_attrs)),
            list(range(n_brands)),
            gap,
            ctx["attributes"],
            ctx["brands"],
            n_attrs,
            n_brands
        )

        # Per-Brand Correlations (Sheet 7)
        corr_pb = calc.corr_per_brand(ctx["scores_matrix"], ctx["utility_matrix"], n_attrs, n_brands, n_resps)

        # 2. Build Multi-Sheet Excel Workbook
        with pd.ExcelWriter(output_path, engine='xlsxwriter') as writer:
            # Sheet 1: CBI
            df_cbi = pd.DataFrame({
                "#": range(1, n_brands + 1),
                "Brand:": ctx["brands"],
                "CBI": [round(s, 2) for s in cbi_scores]
            })
            df_cbi.to_excel(writer, sheet_name='CBI', index=False)

            # Sheet 2: Drivers
            df_drivers = pd.DataFrame({
                "#": range(1, n_attrs + 1),
                "Attribute": ctx["attributes"],
                "Correlation": [round(c * 100, 4) for c in correlations],
                "T-Value": [round(t, 2) for t in weighted_t]
            })
            df_drivers.to_excel(writer, sheet_name='Drivers', index=False)

            # Sheet 3: POP_POD Classification
            df_poppod.to_excel(writer, sheet_name='POP_POD', index=False)

            # Sheet 4: Scores (Raw Frequency Counts)
            df_scores = pd.DataFrame(freq_matrix.tolist(), columns=ctx["brands"])
            df_scores.insert(0, "Attribute", ctx["attributes"])
            df_scores.to_excel(writer, sheet_name='Scores', index=False)

            # Sheet 5: Normalized Gap Matrix (Independence Model Residuals)
            df_norm = pd.DataFrame(norm_gap, columns=ctx["brands"])
            df_norm.insert(0, "Attribute", ctx["attributes"])
            df_norm.to_excel(writer, sheet_name='Normalized Gap', index=False)

            # Sheet 6: Awareness Pct (Association Levels)
            df_aw_pct = pd.DataFrame(freq_pct, columns=ctx["brands"])
            df_aw_pct.insert(0, "Attribute", ctx["attributes"])
            df_aw_pct.to_excel(writer, sheet_name='Awareness Pct', index=False)

            # Sheet 7: Correlation Per Brand (Specific Equity Drivers)
            df_corr_pb = pd.DataFrame(corr_pb, columns=ctx["brands"])
            df_corr_pb.insert(0, "Attribute", ctx["attributes"])
            df_corr_pb.to_excel(writer, sheet_name='Corr Per Brand', index=False)

            # Apply UI and column formatting to all sheets
            for sheet_name in writer.sheets:
                ws = writer.sheets[sheet_name]
                ws.set_column('A:A', 5)
                ws.set_column('B:B', 30)
                ws.set_column('C:Z', 15)

        return output_path
