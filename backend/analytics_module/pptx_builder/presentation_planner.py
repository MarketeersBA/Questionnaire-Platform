from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class SlideType(Enum):
    COVER = "cover"
    SURVEY_OVERVIEW = "survey_overview"
    EXECUTIVE_SUMMARY = "executive_summary"
    STRATEGIC_NARRATIVE = "strategic_narrative"
    STRATEGIC_INTELLIGENCE = "strategic_intelligence"
    SECTION_DIVIDER = "section_divider"
    CONTENT_SLIDE = "content_slide"
    SWOT = "swot"
    RECOMMENDATIONS_4P = "recommendations_4p"
    BRAND_PROFILE = "brand_profile"
    CLOSING = "closing"

class SlideIntent:
    """Represents a planned slide in the presentation."""
    def __init__(self, type: SlideType, data: Any = None, title: str = None):
        self.type = type
        self.data = data
        self.title = title

    def __repr__(self):
        return f"<SlideIntent type={self.type.value} title={self.title}>"

class PresentationPlanner:
    """
    Orchestrates the structural parity between the web report and PPTX.
    Replicates the React/Frontend grouping and ordering logic.
    """

    CHART_GROUP_ORDER = {
        'Brand Profiles': 10,
        'Criteria Analysis': 20,
        'Comparisons': 30,
        'Performance': 40,
        'Purchase Funnel': 50,
        'Trends': 55,
        'Attribute Analysis': 60,
        'NPS & Loyalty': 70,
        'Verbatim Analysis': 80,
        'Dashboard': 90,
        'Brand Analyzer': 100,
    }

    CHART_PRIORITY_BY_ID = {
        'criteria_table': 100,
        'brand_profile_snake': 110,
        'likeness_profile_chart': 120,
        'importance_combined': 130,
        'product_preference': 200,
        'overall_averages': 210,
        'demographic_sub_averages': 220,
        'purchase_funnel': 300,
        'overall_switch': 310,
        'switch_per_brand': 320,
        'attribute_radar': 400,
        'purchase_intent': 500,
        'brand_comparison_pi_ol': 505,
        'brand_awareness': 510,
        'purchase_funnel_headline_line': 520,
        'purchase_funnel_ratio_cards': 530,
        'purchase_funnel_reference_table': 540,
        'nps_recommend': 600,
        'price_sensitivity': 610,
        'brand_analyzer_cbi': 800,
        'brand_analyzer_perception': 810,
        'brand_analyzer_perception_performance': 820,
        'brand_analyzer_perception_imagery': 830,
    }

    STRATEGIC_CHART_IDS = [
        'market_position_sigma', 
        'audience_affinity', 
        'competitive_position_matrix'
    ]

    @classmethod
    def resolve_chart_group_name(cls, chart: Dict[str, Any]) -> str:
        """Mirrors resolveChartGroupName in SurveyReport.tsx"""
        id = chart.get("chart_id")
        t = chart.get("chart_type")
        
        if t == 'scorecard': return 'Brand Profiles'
        if id in ['purchase_funnel_headline_line', 'brand_awareness', 'purchase_intent']: 
            return 'Purchase Funnel'
        if t in ['funnel_ratio_cards', 'snake_line', 'reference_table'] or id == 'purchase_funnel': 
            return 'Purchase Funnel'
        if t in ['criteria_table', 'profile_chart', 'likeness_profile']: 
            return 'Criteria Analysis'
        if t in ['horizontal_bar', 'stacked_bar', 'brand_comparison']: 
            return 'Comparisons'
        if t == 'grouped_bar': return 'Performance'
        if t == 'funnel': return 'Purchase Funnel'
        if t == 'radar': return 'Attribute Analysis'
        if t == 'gauge': return 'NPS & Loyalty'
        if t == 'wordcloud': return 'Verbatim Analysis'
        if t == 'line': return 'Trends'
        if t == 'positioning_table' or id.startswith('brand_analyzer_'): return 'Brand Analyzer'
        
        return 'Dashboard'

    @classmethod
    def order_charts(cls, raw_charts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Mirrors buildOrderedCharts in SurveyReport.tsx"""
        if not raw_charts:
            return []

        prepared = []
        for idx, chart in enumerate(raw_charts):
            group = cls.resolve_chart_group_name(chart)
            prepared.append({
                "chart": chart,
                "idx": idx,
                "group": group,
                "groupOrder": cls.CHART_GROUP_ORDER.get(group, 999),
                "idPriority": cls.CHART_PRIORITY_BY_ID.get(chart.get("chart_id"), 9999),
                "titleKey": str(chart.get("title") or "").lower()
            })

        # Sort: Group -> Priority -> Title -> Original Index
        prepared.sort(key=lambda x: (x["groupOrder"], x["idPriority"], x["titleKey"], x["idx"]))

        ordered = [p["chart"] for p in prepared]

        # Anchor policy: place brand_awareness immediately after purchase_intent
        try:
            purchase_idx = next(i for i, c in enumerate(ordered) if c.get("chart_id") == "purchase_intent")
            ba_idx = next(i for i, c in enumerate(ordered) if c.get("chart_id") == "brand_awareness")
            
            if ba_idx != purchase_idx + 1:
                ba_chart = ordered.pop(ba_idx)
                insert_at = purchase_idx + 1 if purchase_idx < ba_idx else purchase_idx + 1
                ordered.insert(insert_at, ba_chart)
        except (StopIteration, IndexError):
            pass

        return ordered

    @classmethod
    def define_slide_intents(cls, report_doc: Dict[str, Any]) -> List[SlideIntent]:
        """
        Constructs the full deck narrative based on the report document state.
        This is the source of truth for PPTX structure.
        """
        intents = []
        metadata = report_doc.get("metadata", {})
        insights = report_doc.get("insights", {})

        # 1. Cover
        intents.append(SlideIntent(SlideType.COVER, data=metadata))

        # 2. Survey Overview
        intents.append(SlideIntent(SlideType.SURVEY_OVERVIEW, data=metadata))

        # 3. Strategic Narrative (Phase 1 Premium)
        intents.append(SlideIntent(SlideType.STRATEGIC_NARRATIVE, data={"insights": insights, "metadata": metadata}))

        # 4. Executive Summary (Detailed Deck)
        if (
            insights.get("executive_summary")
            or insights.get("key_findings")
            or insights.get("opportunity_insights")
        ):
            intents.append(SlideIntent(SlideType.EXECUTIVE_SUMMARY, data=insights))


        # 4. Strategic Intelligence
        # Isolate strategic charts
        all_charts = cls.order_charts(report_doc.get("charts", []) or [])
        strategic_charts = [c for c in all_charts if c.get("chart_id") in cls.STRATEGIC_CHART_IDS]
        content_charts = [c for c in all_charts if c.get("chart_id") not in cls.STRATEGIC_CHART_IDS]

        if insights.get("market_position_report") or strategic_charts:
            intents.append(
                SlideIntent(
                    SlideType.STRATEGIC_INTELLIGENCE,
                    data={
                        "market_position_report": insights.get("market_position_report"),
                        "charts": strategic_charts,
                    },
                )
            )

        # 4.5 Dynamic Brand Profiles (Premium N-Slide Sequence)
        # We extract all brand card scorecards to generate their own premium slides
        brand_cards = [c for c in content_charts if c.get("chart_type") == "scorecard" and c.get("chart_id", "").startswith("brand_card_")]
        other_content_charts = [c for c in content_charts if c not in brand_cards]
        
        if brand_cards:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Brand Profiles"))
            for i, card in enumerate(brand_cards):
                # Bind specific AI brand insight if available in the enriched payload
                brand_insight = card.get("_enriched_ai_insight") or ""
                intents.append(
                    SlideIntent(
                        SlideType.BRAND_PROFILE,
                        data={
                            "brand_data": card,
                            "ai_insight": brand_insight,
                            "brand_index": i + 1,
                            "total_brands": len(brand_cards)
                        },
                        title=f"Brand Profile: {card.get('title')}"
                    )
                )

        # 4.6 Criteria Analysis (Localized Premium Sequence)
        # Sequence: Criteria Table -> Performance Profile -> Likeness Profile
        criteria_charts_ids = ["criteria_table", "brand_profile_snake", "likeness_profile_chart"]
        criteria_analysis_charts = []
        
        # Extract and order strictly
        for cid in criteria_charts_ids:
            found = [c for c in other_content_charts if c.get("chart_id") == cid]
            if found:
                chart = found[0]
                # Map AI insight to subtitle for the builder if enriched
                if "_enriched_ai_insight" in chart:
                    chart["subtitle"] = chart["_enriched_ai_insight"]
                criteria_analysis_charts.append(chart)
        
        # Remove them from the general fallback pool
        other_content_charts = [c for c in other_content_charts if c.get("chart_id") not in criteria_charts_ids]

        if criteria_analysis_charts:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Criteria Analysis"))
            for chart in criteria_analysis_charts:
                intents.append(
                    SlideIntent(
                        SlideType.CONTENT_SLIDE, 
                        data=chart, 
                        title=chart.get("title")
                    )
                )

        # 4.7 Comparisons (localized Premium Sequence)
        # Sequence: Brand Strategic Comparison (PI vs OL)
        comparison_charts_ids = ["brand_comparison_pi_ol"]
        comparison_charts = []
        
        for cid in comparison_charts_ids:
            found = [c for c in other_content_charts if c.get("chart_id") == cid]
            if found:
                chart = found[0]
                if "_enriched_ai_insight" in chart:
                    chart["subtitle"] = chart["_enriched_ai_insight"]
                comparison_charts.append(chart)
        
        # Remove them from the general fallback pool
        other_content_charts = [c for c in other_content_charts if c.get("chart_id") not in comparison_charts_ids]

        if comparison_charts:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Comparisons"))
            for chart in comparison_charts:
                intents.append(
                    SlideIntent(
                        SlideType.CONTENT_SLIDE, 
                        data=chart, 
                        title=chart.get("title")
                    )
                )

        # 4.8 Purchase Funnel (Section — 04)
        funnel_sequence_ids = [
            "purchase_funnel",
            "purchase_intent",
            "brand_awareness",
            "purchase_funnel_ratio_cards",
            "purchase_funnel_reference_table"
        ]
        funnel_charts = {}
        for cid in funnel_sequence_ids:
            found = [c for c in other_content_charts if c.get("chart_id") == cid]
            if found:
                chart = found[0]
                if "_enriched_ai_insight" in chart:
                    chart["subtitle"] = chart["_enriched_ai_insight"]
                funnel_charts[cid] = chart

        # Remove from general pool
        other_content_charts = [c for c in other_content_charts if c.get("chart_id") not in funnel_sequence_ids]

        if funnel_charts:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Section 04: Purchase Funnel"))
            
            # Simple ordered sequence for the first 3
            for cid in ["purchase_funnel", "purchase_intent", "brand_awareness"]:
                if cid in funnel_charts:
                    c = funnel_charts[cid]
                    intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=c, title=c.get("title")))
            
            # Funnel Ratio Cards (Chunked: 2 per slide)
            if "purchase_funnel_ratio_cards" in funnel_charts:
                c = funnel_charts["purchase_funnel_ratio_cards"]
                brand_cards = c.get("data", {}).get("brand_cards", [])
                if not brand_cards:
                    # Fallback if brand_cards is empty or uses 'ratios' key
                    brand_cards = c.get("data", {}).get("ratios", [])

                for i in range(0, len(brand_cards), 2):
                    chunk = brand_cards[i:i+2]
                    chunk_payload = {
                        **c,
                        "data": {**c.get("data", {}), "brand_cards": chunk},
                        "title": f"{c.get('title')} ({i//2 + 1})" if len(brand_cards) > 2 else c.get("title")
                    }
                    intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=chunk_payload, title=chunk_payload["title"]))

            # Reference Table
            if "purchase_funnel_reference_table" in funnel_charts:
                c = funnel_charts["purchase_funnel_reference_table"]
                intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=c, title=c.get("title")))

        # 4.9 NPS & Loyalty (Section — 05)
        nps_charts_ids = ["nps_recommend"]
        nps_charts = []
        for cid in nps_charts_ids:
            found = [c for c in other_content_charts if c.get("chart_id") == cid]
            if found:
                chart = found[0]
                if "_enriched_ai_insight" in chart:
                    chart["subtitle"] = chart["_enriched_ai_insight"]
                nps_charts.append(chart)
        
        # Remove from general pool
        other_content_charts = [c for c in other_content_charts if c.get("chart_id") not in nps_charts_ids]

        if nps_charts:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Section 05: NPS & Loyalty"))
            for chart in nps_charts:
                intents.append(
                    SlideIntent(
                        SlideType.CONTENT_SLIDE, 
                        data=chart, 
                        title=chart.get("title")
                    )
                )

        # 4.10 Dashboard (Section — 07)
        dashboard_charts_ids = ["importance_combined", "sigma_intent"]
        dashboard_charts = {}
        for cid in dashboard_charts_ids:
            found = [c for c in other_content_charts if c.get("chart_id") == cid]
            if found:
                chart = found[0]
                if "_enriched_ai_insight" in chart:
                    chart["subtitle"] = chart["_enriched_ai_insight"]
                dashboard_charts[cid] = chart

        # Remove from general pool
        other_content_charts = [c for c in other_content_charts if c.get("chart_id") not in dashboard_charts_ids]

        if dashboard_charts:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Section 07: Dashboard"))
            
            # 1. Unified Importance Scatter (Main + Sub)
            if "importance_combined" in dashboard_charts:
                val = dashboard_charts["importance_combined"]
                if isinstance(val, list):
                    for slide_payload in val:
                        intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=slide_payload, title=slide_payload.get("title")))
                else:
                    intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=val, title=val.get("title")))
            
            # 3. Sigma Intent (Chunked: One per attribute)
            if "sigma_intent" in dashboard_charts:
                c = dashboard_charts["sigma_intent"]
                attributes = c.get("data", {}).get("attributes", [])
                raw_datasets = c.get("data", {}).get("datasets", {})
                headlines = c.get("data", {}).get("headlines", {})
                
                if attributes:
                    for attr in attributes:
                        attr_data = raw_datasets.get(attr, []) if isinstance(raw_datasets, dict) else []
                        chunk_payload = {
                            **c,
                            "title": f"{c.get('title')} ({attr})",
                            "data": {
                                **c.get("data", {}),
                                "datasets": [{"label": attr, "data": attr_data}]
                            }
                        }
                        # Map subtitle: Premium AI insight if available, else fallback to synthesized headline
                        if "_enriched_ai_insight" in c:
                            chunk_payload["subtitle"] = c["_enriched_ai_insight"]
                        else:
                            chunk_payload["subtitle"] = headlines.get(attr, c.get("subtitle"))
                        
                        intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=chunk_payload, title=chunk_payload["title"]))
                else:
                    # Fallback safety: never drop sigma slide when attributes are missing.
                    fallback_data = {**c.get("data", {})}
                    if isinstance(raw_datasets, dict) and raw_datasets:
                        default_attr = fallback_data.get("default_attribute")
                        selected_attr = default_attr if default_attr in raw_datasets else next(iter(raw_datasets.keys()), None)
                        if selected_attr is not None:
                            fallback_data["datasets"] = [
                                {"label": selected_attr, "data": raw_datasets.get(selected_attr, [])}
                            ]
                            fallback_title = f"{c.get('title')} ({selected_attr})"
                        else:
                            fallback_data["datasets"] = []
                            fallback_title = c.get("title")
                    elif isinstance(raw_datasets, list):
                        fallback_data["datasets"] = raw_datasets
                        fallback_title = c.get("title")
                    else:
                        fallback_data["datasets"] = []
                        fallback_title = c.get("title")

                    fallback_payload = {
                        **c,
                        "title": fallback_title,
                        "data": fallback_data,
                    }
                    if "_enriched_ai_insight" in c:
                        fallback_payload["subtitle"] = c["_enriched_ai_insight"]
                    elif isinstance(headlines, dict) and headlines:
                        fallback_payload["subtitle"] = next(iter(headlines.values()))
                    intents.append(
                        SlideIntent(
                            SlideType.CONTENT_SLIDE,
                            data=fallback_payload,
                            title=fallback_payload.get("title"),
                        )
                    )

        # 5. Content Groups (with Dividers)
        chart_groups: Dict[str, List[Dict[str, Any]]] = {}
        for chart in other_content_charts:
            group = cls.resolve_chart_group_name(chart)
            if group not in chart_groups:
                chart_groups[group] = []
            chart_groups[group].append(chart)

        # Iterate in sorted group order
        sorted_groups = sorted(chart_groups.keys(), key=lambda g: cls.CHART_GROUP_ORDER.get(g, 999))
        for group in sorted_groups:
            # Add Section Divider
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title=group))
            
            # Add each chart in the group
            for chart in chart_groups[group]:
                intents.append(SlideIntent(SlideType.CONTENT_SLIDE, data=chart, title=chart.get("title")))

        # 6. AI Strategic Layers (SWOT)
        brand_swot = insights.get("brand_swot", {})
        if brand_swot:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Competitive Archetypes (SWOT)"))
            for brand, swot in brand_swot.items():
                intents.append(SlideIntent(SlideType.SWOT, data={"brand": brand, "swot": swot}, title=f"SWOT Analysis: {brand}"))

        # 7. Strategic Roadmap (Recommendations)
        recommendations = insights.get("recommendations_4p", {})
        if recommendations:
            intents.append(SlideIntent(SlideType.SECTION_DIVIDER, title="Strategic Roadmap"))
            intents.append(SlideIntent(SlideType.RECOMMENDATIONS_4P, data=recommendations))

        # 8. Closing
        intents.append(SlideIntent(SlideType.CLOSING, data=metadata))

        return intents
