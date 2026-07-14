import logging
from typing import Set, Optional, Any

import numpy as np
import pandas as pd

from backend.analytics_module.src.MyPPTX import slides, charts, textboxes, tables, design_config


def _handle_slide_dynamic(pres, my_brand, data_map, brand_analyzer_dfs, slide_info: dict, logger: logging.Logger,
                          modified_slides: Set[int]) -> None:
    """Handle one dynamic slide instance (brand_card, cross_tabs, or brand_analyzer)."""
    items = slide_info.get("items", [])
    payload = slide_info.get("data")
    key = slide_info.get("dynamic_key") or slide_info.get("slide_id")
    if not items:
        return
    mod = (items[0][1].get("module") or "").strip().lower()
    if mod == "brand_cards":
        _handle_brand_card_single(pres, key, payload, logger, modified_slides)
    elif mod == "cross-tabs":
        _handle_cross_tab_single(pres, key, payload, items[0][1], logger, modified_slides)
    elif mod == "habits-opinions":
        _handle_habits_opinions(pres, key, payload, items[0][1], logger, modified_slides)
    elif mod == "brand_analyzer":
        vid = slide_info.get("dynamic_key")
        if vid:
            _handle_brand_analyzer(pres, brand_analyzer_dfs, vid, logger, modified_slides)
    elif mod in ["report_component", "dynamic_insight", "analytics_core"]:
        _handle_dynamic_report_component(pres, data_map, slide_info, logger, modified_slides)
    else:
        for _inum, item in items:
            visual_id = item.get("visual_id", "")
            module = (item.get("module") or "").lower()
            if module in ["percentages", "report_component"]:
                _handle_dynamic_report_component(pres, data_map, item, visual_id, logger, modified_slides)
            elif module == "brand_analyzer":
                _handle_brand_analyzer(pres, brand_analyzer_dfs, visual_id, logger, modified_slides)
            elif module == "comparison":
                _handle_comparison(pres, my_brand, data_map, item, visual_id, logger, modified_slides)


def _handle_brand_card_single(pres, key: str, payload: dict, logger: logging.Logger, modified_slides: Set[int]) -> None:
    logger.info("Brand card: %s", key)
    pf = payload.get("pf") if isinstance(payload, dict) else None
    why_mou = payload.get("why_mou") if isinstance(payload, dict) else None
    why_mou_n = payload.get("why_mou_n") if isinstance(payload, dict) else None
    new_slide = slides.duplicate_brand_card_slide_by_number(pres)
    charts.populate_brand_card(new_slide, pf, why_mou, " ".join(key.split(" ")[0:-2]), why_mou_n=why_mou_n)
    slide_index = pres.slides.index(new_slide)
    modified_slides.add(slide_index)


def _handle_cross_tab_single(pres, key: str, payload: dict, item: dict, logger: logging.Logger,
                             modified_slides: Set[int]) -> None:
    logger.info("Cross Tab: %s", key)
    data = payload.get("data") if isinstance(payload, dict) else None
    bases = payload.get("bases") if isinstance(payload, dict) else None
    segments = payload.get("segments") if isinstance(payload, dict) else None
    is_sc = payload.get("is_sc", False) if isinstance(payload, dict) else False
    num_charts = 0 if data is None else len(data.columns)
    slide_title_suffix = f"{num_charts}-sc-charts" if is_sc else f"{num_charts}-charts"
    slide_index = slides.find_slide_by_title(pres, slide_title_suffix)
    if slide_index is None:
        raise ValueError(f"No slide found with title '{slide_title_suffix}'")
    new_slide = slides.duplicate_slide(pres, slide_index)
    if is_sc:
        theme = item.get("sc_theme") or item.get("theme")
        if theme:
            design_config.set_chart_theme(theme)
        aggregation_method = item.get("sc_aggregation_method", "none")
        charts.populate_charts_from_columns_sc(new_slide, data.T, key.split(" ")[0],
                                               aggregation_method=aggregation_method)
    else:
        theme = item.get("mc_theme") or item.get("theme")
        if theme:
            design_config.set_chart_theme(theme)
        charts.populate_charts_from_columns(new_slide, data, key.split(" ")[0])
    textboxes.populate_base_textboxes(new_slide, segments, bases)
    question_text = payload.get("question_text") if isinstance(payload, dict) else None
    title_is_question = item.get("title_is_question", True)
    subtitle_has_question = item.get("subtitle_has_question", False)
    if question_text and title_is_question:
        textboxes.set_slide_title(new_slide, question_text)
    if question_text and subtitle_has_question:
        textboxes.populate_subtitle_textbox(new_slide, question_text)
    modified_slides.add(pres.slides.index(new_slide))


def _handle_habits_opinions(pres, key: str, payload: dict, item: dict, logger: logging.Logger,
                            modified_slides: Set[int]) -> None:
    """Handle one habits-opinions slide: find template by type_combo (sc, mc, scsc, scmc, mcmc), duplicate, populate each chart."""
    logger.info("Habits/Opinions: %s", key)
    if not isinstance(payload, dict):
        return
    type_combo = payload.get("type_combo", "")
    questions = payload.get("questions", [])
    titles = payload.get("titles", questions)  # custom chart titles; fallback to question names
    data_list = payload.get("data", [])
    types = payload.get("types", [])
    if not type_combo or len(questions) != len(data_list) or len(data_list) != len(types):
        logger.warning("Invalid habits-opinions payload for key %s", key)
        return
    if len(titles) != len(questions):
        titles = questions
    slide_index = slides.find_slide_by_title_exact(pres, type_combo)
    if slide_index is None:
        raise ValueError(f"No slide found with title '{type_combo}'")
    new_slide = slides.duplicate_slide(pres, slide_index)
    chart_list = charts.ChartFinder.get_charts_from_slide(new_slide)
    if len(chart_list) != len(questions):
        raise ValueError(
            f"Habits slide '{type_combo}': chart count ({len(chart_list)}) != question count ({len(questions)})"
        )
    theme = item.get("sc_theme") or item.get("mc_theme") or item.get("theme")
    if theme:
        design_config.set_chart_theme(theme)
    for chart, title, df, q_type in zip(chart_list, titles, data_list, types):
        is_sc = q_type == "sc"
        charts.populate_habits_chart(chart, df, title, is_sc)
    modified_slides.add(pres.slides.index(new_slide))





def _handle_brand_analyzer(pres, brand_analyzer_dfs, visual_id, logger: logging.Logger,
                           modified_slides: Set[int]) -> None:
    try:
        df = brand_analyzer_dfs[visual_id]
        if df is None: return
        if not df.empty:
            # new_table creates a new slide, track it
            _, slide_idx = tables.new_table(pres, df, highlight_rules={
                "POP": (16, 90, 176),  # dark baby blue
                "POD": (121, 167, 221),  # a lighter one
                "Strong": (176, 205, 241),  # a lighter one
                "Unassoc": (255, 220, 220)  # light red
            }, apply_theme=True)
            modified_slides.add(slide_idx)
    except KeyError:
        logger.warning("Brand analyzer table not found: %s", visual_id)
    except Exception:
        logger.exception("Error populating brand analyzer table %s", visual_id)


def _handle_percentages_unified(pres, data_map, item, visual_id, logger: logging.Logger,
                                modified_slides: Set[int],
                                target_slide_index: Optional[int] = None,
                                target_slide: Optional[Any] = None,
                                chart_theme: Optional[str] = None) -> None:
    """
    Unified handler for both percentifier (chart_data) and percentages (metrics) formats.
    Data is stored under "percentages" key in data_map regardless of original module name.
    When target_slide/target_slide_index are set, only that slide is populated (e.g. after duplicating a template).
    chart_theme: optional override; if unset, uses item sc_theme / mc_theme / theme (in that order).
    """
    # Data is stored under "percentages" key (unified in processor)
    section_map = data_map.get("percentages", {})
    data = section_map.get(visual_id)

    if data is None or data.empty:
        logger.info("No data for percentages viz %s", visual_id)
        return

    resolved_theme = (
        chart_theme
        or item.get("theme")
        or item.get("sc_theme")
        or item.get("mc_theme")
    )

    viz_type = item.get("viz_type")

    # Handle table type (from percentages module)
    if viz_type == "table":
        table = tables.get_table_by_name(pres, visual_id, slide=target_slide)
        if table:
            data = data.copy()
            # Normalize percentage column to 0-1 for display (ai_percentages uses "percentage", others may use "Percentage")
            pct_col = "Percentage" if "Percentage" in data.columns else (
                "percentage" if "percentage" in data.columns else None)
            if pct_col:
                data[pct_col] = data[pct_col] / 100
            new_name = item.get("new_name")
            slide_idx = tables.template_table(table, data.head(10), pres, column_override={0: "category"},
                                              percent_cols="all", apply_theme=bool(resolved_theme),
                                              new_name=new_name, slide_index_hint=target_slide_index)
            if slide_idx is not None:
                modified_slides.add(slide_idx)

    # Handle chart type (default for both)
    else:
        # Check if this is a line chart
        chart_type = item.get("chart_type", "").lower()
        if resolved_theme:
            design_config.set_chart_theme(resolved_theme)
        if chart_type == "line":
            # Handle line chart with all its parameters
            new_name = item.get("new_name")
            ymax = item.get("ymax", 10)
            orientation = item.get("orientation")
            charts.populate_line_chart(pres, data, visual_id, new_name=new_name, ymax=ymax, orientation=orientation,
                                       target_slide_index=target_slide_index)
            # Track slides (populate_line_chart doesn't return indices, so we need to find them)
            if target_slide_index is not None:
                modified_slides.add(target_slide_index)
            else:
                search_title = (new_name or visual_id).lower()
                for idx, slide in enumerate(pres.slides):
                    for shape in slide.shapes:
                        if shape.has_chart:
                            chart = shape.chart
                            if chart.has_title:
                                chart_title = chart.chart_title.text_frame.text.strip().lower()
                                if chart_title == search_title or chart_title == visual_id.lower():
                                    modified_slides.add(idx)
                                    break
        else:
            # Regular chart (bar, column, etc.) - get all possible parameters
            orientation = item.get("orientation", "column")
            order_columns = item.get("order_columns")
            slide_indices = charts.populate(
                pres,
                data,
                visual_id,
                orientation=orientation,
                order_columns=order_columns,
                target_slide_index=target_slide_index,
                new_name=item.get("new_name"),
                ymin=item.get("ymin"),
                ymax=item.get("ymax"),
            )

            # Track slides where charts were populated
            for slide_idx in slide_indices:
                modified_slides.add(slide_idx)


def _handle_comparison(pres, my_brand, data_map, item, visual_id, logger: logging.Logger, modified_slides: Set[int],
                       target_slide_index: Optional[int] = None,
                       target_slide: Optional[Any] = None) -> None:
    section = item.get("module")
    comparison_table = data_map.get(section, {}).get(visual_id)
    if comparison_table is None:
        logger.info("No comparison data for %s", visual_id)
        return

    avg_score_cols = [c for c in comparison_table.columns if c.endswith("avg score")]
    t2b_cols = [c for c in comparison_table.columns if c.endswith("T2B")]
    comparators = [c.replace("avg score", "").strip() for c in avg_score_cols]

    index_highlight_rules = None
    if len(comparators) == 2:
        other_comparator = comparators[1] if comparators[0] == my_brand else comparators[0]
        lower = np.where(comparison_table[f"{my_brand} avg score"] < comparison_table[f"{other_comparator} avg score"])[
            0]
        upper = np.where(comparison_table[f"{my_brand} avg score"] > comparison_table[f"{other_comparator} avg score"])[
            0]
        less_than_05 = np.where(comparison_table["significance"] < 0.05)[0]
        maintain = comparison_table.iloc[np.intersect1d(upper, less_than_05)]
        improvement = comparison_table.iloc[np.intersect1d(lower, less_than_05)]
        index_highlight_rules = {
            "significance": [
                {"indices": np.intersect1d(lower + 1, less_than_05 + 1), "bg_color": (242, 220, 219)},
                {"indices": np.intersect1d(upper + 1, less_than_05 + 1), "bg_color": (215, 228, 189)},
            ]
        }

    viz_type = item.get("viz_type")
    if viz_type == "table":
        logger.debug("Filling comparison table for %s", visual_id)
        column_override = {0: "index"}
        if visual_id and visual_id.lower() == "criteria-overall-1":
            column_override.update({3: t2b_cols[0], 4: t2b_cols[1]})

        table = tables.get_table_by_name(pres, visual_id, slide=target_slide)
        if table is None and visual_id and visual_id.lower() in ("criteria-overall-1", "criteria-overall"):
            table = tables.get_table_by_name(pres, "Criteria", slide=target_slide)
        if table is None:
            logger.info("No table found for comparison %s (tried %s and 'Criteria')", visual_id, visual_id)
            return
        new_name = item.get("new_name")
        slide_idx = tables.template_table(table, comparison_table.reset_index(), pres, column_override=column_override,
                                          new_name=new_name,
                                          index_highlight_rules=index_highlight_rules,
                                          apply_theme=bool(item.get("theme")),
                                          slide_index_hint=target_slide_index)
        if slide_idx is not None:
            modified_slides.add(slide_idx)

        if visual_id == "Criteria-Sub":
            maintain_table = tables.get_table_by_name(pres, "Areas To Maintain", slide=target_slide)
            if maintain_table:
                slide_idx = tables.template_table(maintain_table, maintain.reset_index(), pres,
                                                  column_override=column_override, apply_theme=bool(item.get("theme")),
                                                  slide_index_hint=target_slide_index)
                if slide_idx is not None:
                    modified_slides.add(slide_idx)
            improve_table = tables.get_table_by_name(pres, "Areas To Improve", slide=target_slide)
            if improve_table:
                slide_idx = tables.template_table(improve_table, improvement.reset_index(), pres,
                                                  column_override=column_override, apply_theme=bool(item.get("theme")),
                                                  slide_index_hint=target_slide_index)
                if slide_idx is not None:
                    modified_slides.add(slide_idx)

    elif viz_type == "scatter":
        X = comparison_table["importance"]
        Y = comparison_table[avg_score_cols]
        new_name = item.get("new_name", visual_id)
        if "{highest_feature}" in new_name:
            ref_id = item.get("highest_feature_from")
            ref_table = data_map.get(section, {}).get(ref_id) if ref_id else None
            ref_importance = ref_table[
                "importance"] if ref_table is not None and "importance" in ref_table.columns else X
            new_name = new_name.replace("{highest_feature}", ref_importance.idxmax())
        top_n = item.get("top_n", 7)
        show_labels = item.get("show_labels", True)
        label_category = item.get("label_category", "None")
        # Auto-detect chart type: line-with-markers uses importance-spaced categories
        chart_location = charts.ChartFinder.get_chart_with_location(
            pres, visual_id, target_slide_index=target_slide_index
        )
        if chart_location and chart_location[2].chart_type in charts.LINE_CHART_TYPES:
            highlight_top_n = item.get("highlight_top_n", 0)
            rect_overrides = item.get("rect") or item.get("highlight_rect")
            slide_indices = charts.update_importance_line_chart_by_title_top_n(
                pres, visual_id, X, Y, new_name,
                top_n=top_n,
                show_labels=show_labels,
                label_category=label_category,
                target_slide_index=target_slide_index,
                highlight_top_n=highlight_top_n,
                rect_overrides=rect_overrides,
            )
        else:
            slide_indices = charts.update_scatter_chart_by_title_top_n(
                pres, visual_id, X, Y, new_name,
                top_n=top_n,
                show_labels=show_labels,
                label_category=label_category,
                target_slide_index=target_slide_index
            )
        # Track slides where charts were updated
        for slide_idx in slide_indices:
            modified_slides.add(slide_idx)

    elif visual_id in ("overall Averages", "Sub Averages"):
        # compact handling for average charts (supports 2 or 3+ brands)
        num_rows = min(9, len(comparison_table)) if visual_id == "overall Averages" else min(18,
                                                                                             len(comparison_table.index))
        distances = pd.DataFrame(
            {c: [1 + i * 1.5 for i in range(num_rows)] for c in comparators}
        )
        chart_df = pd.concat(
            [comparison_table[avg_score_cols].reset_index(), distances.iloc[::-1].reset_index(drop=True)], axis=1).iloc[
            :num_rows]
        new_name = item.get("new_name", visual_id)

        def _populate_one_comparison_chart(chart, chart_slide_idx, chart_shape):
            config_xmax = item.get("inputs", {}).get("ideal") or item.get("xmax")
            config_ymax = item.get("ymax")
            config_ymin = item.get("ymin")
            config_show_label = item.get("show_label", False)
            config_label_column = item.get("label_column", "index")
            xmax_value = config_xmax if config_xmax is not None else None
            ymax_value = config_ymax if config_ymax is not None else (chart_df[comparators[0]].iloc[0] + 0.5)
            # ymin_value = config_ymin if config_ymin is not None else (chart_df[comparators[0]].iloc[-1] - 0.5)
            ymin_value = 0 + 0.5
            charts.populate_xy_chart(
                chart_df,
                chart,
                avg_score_cols,
                comparators,
                f"{new_name}",
                label_column=config_label_column,
                ymax=ymax_value,
                xmax=xmax_value if xmax_value is not None else 10,
                ymin=ymin_value,
                show_label=config_show_label,
                chart_shape=chart_shape,
            )
            if chart_slide_idx is not None:
                modified_slides.add(chart_slide_idx)

        if target_slide_index is not None:
            result = charts.ChartFinder.get_chart_with_location(pres, visual_id, target_slide_index=target_slide_index)
            if result:
                chart_slide_idx, chart_shape, chart = result
                _populate_one_comparison_chart(chart, chart_slide_idx, chart_shape)
        else:
            chart = charts.get_chart(pres, visual_id)
            while chart:
                chart_slide_idx = None
                chart_shape = None
                for idx, slide in enumerate(pres.slides):
                    for shape in slide.shapes:
                        if shape.has_chart and shape.chart == chart:
                            chart_slide_idx = idx
                            chart_shape = shape
                            break
                    if chart_slide_idx is not None:
                        break
                _populate_one_comparison_chart(chart, chart_slide_idx, chart_shape)
                chart = charts.get_chart(pres, visual_id)


def _handle_dynamic_report_component(pres, data_map, item, visual_id=None, logger=None, 
                                     modified_slides=None, target_slide_index=None) -> None:
    """
    Expert semantic handler that maps analytical report modules to advanced 
    XL_CHART_TYPEs and premium corporate color strategies.
    
    This handler supports:
    - brand_awareness: Clustered columns with brand-matched colors.
    - purchase_funnel: Clustered bars with a logical gradient progression.
    - market_position: Radar charts using premium Sigma styling.
    """
    visual_id = visual_id or item.get("chart_id")
    # Data retrieval with fallback
    section_map = data_map.get("percentages", {})
    data = section_map.get(visual_id) if isinstance(section_map, dict) else None
    
    if data is None or (isinstance(data, (pd.DataFrame, pd.Series)) and data.empty):
        # Allow passing data directly in the item for real-time injections
        data = item.get("data")
        if data is None:
            return

    # 1. Standardize to DataFrame if it's raw JSON
    if not isinstance(data, (pd.DataFrame, pd.Series)):
        from .chart_transformers import ChartDataTransformer
        data = ChartDataTransformer.transform(data, chart_type=item.get("chart_type", "bar"))

    # 2. Semantic Analysis & Overrides
    chart_id = (item.get("chart_id") or "").lower()
    chart_type = (item.get("chart_type") or "bar").lower()
    
    xl_type = None
    color_override = None
    
    # CASE: Brand Awareness -> Pure Clustered Columns
    if "brand_awareness" in chart_id or "awareness" in chart_id:
        xl_type = "COLUMN_CLUSTERED"
        # Pure Brand Palette (Primary Corporate Colors)
        color_override = [(0, 32, 96), (0, 112, 192), (0, 176, 240), (146, 208, 80), (255, 192, 0)]
        
    # CASE: Purchase Funnel -> Gradient Bars
    elif "purchase_funnel" in chart_id or "funnel" in chart_id:
        xl_type = "BAR_CLUSTERED"
        # Funnel Gradient (Navy -> Light Sky)
        color_override = [(0, 32, 96), (44, 82, 142), (83, 126, 185), (140, 175, 222), (180, 205, 240)]
        
    # CASE: Market Position / Sigma -> Radar / Spatial
    elif "market_position" in chart_id or chart_type == "radar":
        xl_type = "RADAR"
        # Sigma Branding (Deep Purple & Vibrant Teal)
        color_override = [(112, 48, 160), (0, 176, 240)]

    # 3. Execution via Unified Population Engine
    success_indices = charts.populate(
        pres,
        data,
        visual_id,
        new_name=item.get("title") or item.get("new_name"),
        target_slide_index=target_slide_index,
        chart_type_override=xl_type,
        color_override=color_override,
        ymax=item.get("ymax", 1.0)
    )

    if modified_slides is not None:
        for idx in success_indices:
            modified_slides.add(idx)

