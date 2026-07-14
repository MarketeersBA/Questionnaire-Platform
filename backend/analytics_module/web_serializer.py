from typing import Dict, Any, List, Optional
import logging
import pandas as pd
from backend.models import ChartPayload
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept

logger = logging.getLogger(__name__)

class WebReportSerializer:
    """
    Transforms slide payloads (usually DataFrames or raw dicts) into standard
    ChartPayload envelopes that the frontend ChartRenderer expects.
    """
    
    @classmethod
    def serialize_slide(cls, concept: DynamicSlideConcept, raw_payload: Any) -> List[ChartPayload]:
        """
        Dispatches to the correct serializer based on the concept class name.
        Returns a list of ChartPayloads (some slides contain multiple charts).
        """
        class_name = concept.__class__.__name__
        
        # Dispatch map. The keys are exact class names from `slides/concepts.py`
        dispatch = {
            "TasteTestPreferenceSlide": cls._serialize_preference,
            "TasteTestImportanceSlide": cls._serialize_scatter,
            "TasteTestPurchaseIntentSlide": cls._serialize_horizontal_bar,
            "TasteTestNpsSlide": cls._serialize_horizontal_bar,
            "TasteTestSubFeaturesSlide": cls._serialize_horizontal_bar,
            "TasteTestOverallFeaturesSlide": cls._serialize_overall_features,
            "TasteTestLikesSlide": lambda c, p: cls._serialize_open_end(c, p, "Likes"),
            "TasteTestDislikesSlide": lambda c, p: cls._serialize_open_end(c, p, "Dislikes"),
            "TasteTestImprovementsSlide": lambda c, p: cls._serialize_open_end(c, p, "Improvements"),
            "BrandAwarenessSlide": cls._serialize_grouped_bar,
            "PurchaseFunnelChartSlide": cls._serialize_funnel,
            "PurchaseFunnelTableSlide": cls._serialize_crosstab,
            "BrandCardSlide": cls._serialize_brand_card,
            "CrossTabsSlide": cls._serialize_crosstab,
            "CriteriaTableSlide": cls._serialize_criteria_suite,
            "PreferenceComparisonSlide": cls._serialize_criteria_suite,
            "AveragesComparisonSlide": cls._serialize_criteria_suite,
            "OpportunityAnalysisSlide": cls._serialize_opportunity,
        }
        
        handler = dispatch.get(class_name)
        if not handler:
            logger.warning(f"No specific serializer for {class_name}, using generic table fallback")
            return cls._serialize_generic(concept, raw_payload)
            
        try:
            return handler(concept, raw_payload)
        except Exception as e:
            logger.error(f"Failed to serialize {class_name}: {e}")
            # Fallback to an empty error chart so the UI doesn't crash
            return [ChartPayload(
                chart_id=f"error_{concept.template_slide_title}",
                chart_type="table",
                title=f"Error rendering: {concept.template_slide_title}",
                data={"error": str(e)},
            )]

    @staticmethod
    def _create_payload(concept: DynamicSlideConcept, chart_type: str, data: Dict, suffix: str = "") -> ChartPayload:
        comp = getattr(concept, "comparator", None)
        return ChartPayload(
            chart_id=f"{concept.template_slide_title}_{suffix}".strip("_").replace(" ", "_").lower(),
            chart_type=chart_type,
            title=concept.template_slide_title,
            subtitle=getattr(concept, "template_slide_subtitle", None),
            data=data,
            brands=comp if comp else [],
            comparator=comp,
        )

    @classmethod
    def _serialize_preference(cls, concept: DynamicSlideConcept, payload: pd.DataFrame) -> List[ChartPayload]:
        # DataFrame format: Target Columns vs Choice %
        # Convert to grouped_bar format for frontend
        labels = payload.index.tolist()
        datasets = []
        for col in payload.columns:
            datasets.append({
                "label": col,
                "data": payload[col].tolist()
            })
            
        data = {"labels": labels, "datasets": datasets}
        return [cls._create_payload(concept, "grouped_bar", data)]

    @classmethod
    def _serialize_overall_features(cls, concept: DynamicSlideConcept, payload: pd.DataFrame) -> List[ChartPayload]:
        # DataFrame format: Features vs Brands
        labels = payload.index.tolist()
        datasets = []
        for col in payload.columns:
            datasets.append({
                "label": col,
                "data": payload[col].tolist()
            })
            
        data = {"labels": labels, "datasets": datasets}
        return [cls._create_payload(concept, "grouped_bar", data)]

    @classmethod
    def _serialize_grouped_bar(cls, concept: DynamicSlideConcept, payload: pd.DataFrame) -> List[ChartPayload]:
        labels = payload.index.tolist()
        datasets = []
        for col in payload.columns:
            datasets.append({
                "label": col,
                "data": payload[col].tolist()
            })
            
        data = {"labels": labels, "datasets": datasets}
        return [cls._create_payload(concept, "grouped_bar", data)]

    @classmethod
    def _serialize_scatter(cls, concept: DynamicSlideConcept, payload: Any) -> List[ChartPayload]:
        importances, performances = payload
        # importances: Series of feature -> correlation
        # performances: DataFrame of feature -> brand -> mean score
        
        # Build scatter matrix data
        datasets = []
        features = importances.index.tolist()
        if performances is not None and not performances.empty:
            for brand in performances.columns:
                points = []
                for feat in features:
                    x_val = float(importances.get(feat, 0))
                    y_val = float(performances.loc[feat, brand]) if feat in performances.index else 0
                    points.append({"x": x_val, "y": y_val, "label": feat})
                datasets.append({"label": brand, "data": points})
            
        data = {"datasets": datasets}
        return [cls._create_payload(concept, "scatter", data)]

    @classmethod
    def _serialize_horizontal_bar(cls, concept: DynamicSlideConcept, payload: pd.DataFrame) -> List[ChartPayload]:
        # DataFrame layout: Labels vs Brands. Used for sub-features, purchase intent, NPS
        labels = payload.index.tolist()
        datasets = []
        for col in payload.columns:
            # check if it is nps structure
            if 'NPS_Score' in labels or 'NPS_Score' in payload.index:
                # If Series (which has NPS_Score) - special handle
                if isinstance(payload[col], dict) or isinstance(payload[col], pd.Series):
                    ser = payload[col]
                    datasets.append({
                        "label": col,
                        "data": [
                            float(ser.get('Promoters_Pct', 0)),
                            float(ser.get('Passives_Pct', 0)),
                            float(ser.get('Detractors_Pct', 0))
                        ]
                    })
                    labels = ["Promoters_Pct", "Passives_Pct", "Detractors_Pct"]
            else:
                datasets.append({
                    "label": col,
                    "data": payload[col].tolist()
                })
            
        data = {"labels": labels, "datasets": datasets}
        return [cls._create_payload(concept, "horizontal_bar", data)]

    @classmethod
    def _serialize_open_end(cls, concept: DynamicSlideConcept, payload: pd.DataFrame, oe_type: str) -> List[ChartPayload]:
        # Payload is Top N phrases vs counts
        if payload is None or payload.empty:
            return []
            
        # Try to handle multi-brand DataFrames or single Series
        if isinstance(payload, pd.Series):
            words = [{"text": str(idx), "value": int(val)} for idx, val in payload.items()]
            data = {"words": words}
            return [cls._create_payload(concept, "wordcloud", data)]
            
        charts = []
        for col in payload.columns:
            brand_series = payload[col].dropna()
            words = [{"text": str(idx), "value": int(val)} for idx, val in brand_series.items()]
            data = {"words": words, "brand": col}
            chart = cls._create_payload(concept, "wordcloud", data, suffix=col)
            chart.title = f"{col} - {oe_type}"
            charts.append(chart)
        return charts

    @classmethod
    def _serialize_verbatim_analysis(cls, concept: DynamicSlideConcept, payload: Dict[str, Any]) -> List[ChartPayload]:
        """
        Serializes brand-scoped verbatim analysis.
        payload: { "QuestionName": { "brands": { "BrandA": analysis_dict }, "synthesis": "..." } }
        """
        if not payload:
            return []
            
        charts = []
        for question_title, results in payload.items():
            # Support both old flat format and new brand-scoped format
            is_new = isinstance(results, dict) and ("brands" in results or "synthesis" in results)
            
            if is_new:
                data = {
                    "brands": results.get("brands", {}),
                    "synthesis": results.get("synthesis", "")
                }
            else:
                data = {"analysis": results}
                
            title = f"{question_title} — Neural Thematic Synthesis"
            
            comp = getattr(concept, "comparator", None)
            chart = ChartPayload(
                chart_id=f"verbatim_ai_{question_title}".replace(" ", "_").lower(),
                chart_type="verbatim_analysis",
                title=title,
                data=data,
                brands=comp if comp else [],
                comparator=comp
            )
            charts.append(chart)
        return charts

    @classmethod
    def _serialize_funnel(cls, concept: DynamicSlideConcept, payload: pd.DataFrame) -> List[ChartPayload]:
        # DataFrame: Funnel stages vs Brands
        labels = payload.index.tolist()
        datasets = []
        for col in payload.columns:
            datasets.append({
                "label": col,
                "data": payload[col].tolist()
            })
        data = {"labels": labels, "datasets": datasets}
        return [cls._create_payload(concept, "funnel", data)]

    @classmethod
    def _serialize_brand_card(cls, concept: DynamicSlideConcept, payload: dict) -> List[ChartPayload]:
        # Payload contains pf (DataFrame), why_mou (DataFrame), why_mou_n (int)
        # We return multiple charts for a more granular UI display
        charts = []
        
        # 1. Main Profile Scorecard (N size etc)
        # We can pass these as key-value pairs
        profile_data = {
            "Total Sample": payload.get("why_mou_n", 0),
            "Brand": payload.get("brand_name") or concept.template_slide_title
        }
        charts.append(cls._create_payload(concept, "scorecard", {"profile": profile_data}, suffix="profile"))

        # 2. Purchase Funnel (Bar Chart)
        pf_df = payload.get("pf")
        if pf_df is not None and not pf_df.empty:
            # Standard funnel format: labels & datasets
            # In BrandCard, pf_df is typically a Series or 1-col DataFrame from brand_analyzer
            labels = pf_df.index.tolist()
            if isinstance(pf_df, pd.DataFrame):
                 data_list = [float(v) for v in pf_df.iloc[:, 0].tolist()]
            else: # Series
                 data_list = [float(v) for v in pf_df.tolist()]
            
            datasets = [{
                "label": "Funnel %",
                "data": data_list
            }]
            charts.append(cls._create_payload(concept, "funnel", {"labels": labels, "datasets": datasets}, suffix="funnel"))

        # 3. Why MOU (Table)
        mou_df = payload.get("why_mou")
        if mou_df is not None and not mou_df.empty:
            table_data = {
                "columns": ["Reason", "Score"],
                "rows": []
            }
            # Special case for why_mou which might be a Series or DataFrame
            if isinstance(mou_df, pd.Series):
                 for idx, val in mou_df.items():
                      table_data["rows"].append([str(idx), f"{float(val)*100:.1f}%"])
            else: # DataFrame
                 for idx, val in mou_df.iterrows():
                      table_data["rows"].append([str(idx), f"{float(val.iloc[0])*100:.1f}%"])

            charts.append(cls._create_payload(concept, "table", table_data, suffix="mou"))

        return charts

    @classmethod
    def _serialize_crosstab(cls, concept: DynamicSlideConcept, payload: pd.DataFrame) -> List[ChartPayload]:
        # Standard table layout
        data = {
            "columns": ["Label"] + payload.columns.tolist(),
            "rows": []
        }
        for idx, row in payload.iterrows():
            data["rows"].append([idx] + row.tolist())
            
        return [cls._create_payload(concept, "table", data)]

    @classmethod
    def _serialize_criteria_suite(cls, concept: DynamicSlideConcept, payload: Dict[str, Any]) -> List[ChartPayload]:
        """
        Unified serializer for all comparative suite slides.
        Works with the dictionary structure returned by comparative.py
        """
        if not payload: return []
        
        charts = []
        for key, config in payload.items():
            ct = config.get("chart_type", "table")
            title = config.get("title", concept.template_slide_title)
            data = config.get("data") or config.get("rows")
            
            # Additional metadata for the frontend
            meta = {
                "footnote": config.get("footnote"),
                "brands": config.get("brands", []),
                "competitor": config.get("competitor_name")
            }
            
            # Wrap data for table specifically if needed
            if ct == "table" and isinstance(data, list):
                # If rows are dicts (standard for comparative), we flatten for generic table renderer
                if data and isinstance(data[0], dict):
                    cols = [c.replace("_", " ").title() for c in data[0].keys()]
                    rows = [list(r.values()) for r in data]
                    data = {"columns": cols, "rows": rows}

            charts.append(ChartPayload(
                chart_id=f"{concept.slide_id}_{key}",
                chart_type=ct,
                title=title,
                data=data,
                brands=meta["brands"],
                comparator=meta["competitor"]
            ))
            
        return charts

    @classmethod
    def _serialize_generic(cls, concept: DynamicSlideConcept, payload: Any) -> List[ChartPayload]:
        if isinstance(payload, pd.DataFrame):
            return cls._serialize_crosstab(concept, payload)
        
        # Absolute fallback
        data = {"raw": str(payload)}
        return [cls._create_payload(concept, "table", data)]
    @classmethod
    def _serialize_opportunity(cls, concept: DynamicSlideConcept, payload: Any) -> List[ChartPayload]:
        """
        Serializes pre-computed opportunity signals into card data for the frontend.
        """
        data = {"opportunities": payload if isinstance(payload, list) else []}
        return [cls._create_payload(concept, "opportunity_cards", data)]

    @classmethod
    def _serialize_market_position_radar(cls, concept: DynamicSlideConcept, payload: Dict[str, Any]) -> List[ChartPayload]:
        """[Task 3.2] Serializes the Market Position Sigma Radar."""
        # Use the raw results from aggregator directly
        return [cls._create_payload(concept, "market_position_radar", payload.get("data", {}))]

    @classmethod
    def _serialize_affinity_heatmap(cls, concept: DynamicSlideConcept, payload: Dict[str, Any]) -> List[ChartPayload]:
        """[Task 3.2] Serializes the Audience Affinity Heatmap."""
        return [cls._create_payload(concept, "affinity_heatmap", payload.get("data", {}))]

    @classmethod
    def _serialize_scatter_bubble(cls, concept: DynamicSlideConcept, payload: Dict[str, Any]) -> List[ChartPayload]:
        """[Task 3.2] Serializes the 2D Competitive Positioning Bubble Chart."""
        return [cls._create_payload(concept, "scatter_bubble", payload.get("data", {}))]

    @classmethod
    def serialize_strategic_insight(cls, report_key: str, data: Dict[str, Any]) -> List[ChartPayload]:
        """
        [Task 3.2] Specialized serializer for AI-synthesized strategic sections 
        that don't originate from the standard slide registry.
        """
        chart_map = {
            "market_position_sigma": "market_position_radar",
            "audience_affinity": "affinity_heatmap",
            "positioning_matrix": "scatter_bubble"
        }
        
        ct = chart_map.get(report_key, "table")
        title = data.get("title", report_key.replace("_", " ").title())
        
        return [ChartPayload(
            chart_id=report_key,
            chart_type=ct,
            title=title,
            subtitle=data.get("subtitle"),
            data=data.get("data", {}),
            brands=data.get("brands", []),
            section="Strategic Analysis"
        )]
