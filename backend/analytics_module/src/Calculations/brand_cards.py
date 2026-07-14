import pandas as pd

from backend.analytics_module.src.Calculations.percentages import value_percentages, perc_of_all_values
from backend.analytics_module.src.common.pivot_maker import normalize_one_hot_to_rows


def process_multi_column_data(df, meta_data, chart_data, column_names, meta_grids):
    data = pd.DataFrame()

    for leg, column in chart_data.items():
        if leg in ["Order_By", "Filter"]:
            continue
        if leg.lower().startswith("total"):
            columns = column
            # total_series = pd.Series(dtype=float)
            total_series = None
            for col in columns:
                c = column_names.get(col)
                tmp = value_percentages(df, meta_data, c, meta_grids)
                if tmp.empty or tmp.shape[1] == 0:
                    continue
                tmp_series = tmp.iloc[:, 0]
                # tmp_series = tmp
                if total_series is None:
                    total_series = tmp_series.copy()
                    # total_series = tmp_series.squeeze().copy()
                else:
                    total_series = (total_series.add(tmp_series, fill_value=0))
                    # total_series = (total_series.add(tmp_series.squeeze(), fill_value=0))

            if total_series is not None:
                if data.empty:
                    data = data.reindex(total_series.index)
                    data[leg] = total_series
                else:
                    data = data.reindex(data.index.union(total_series.index)).fillna(0)
                    data.loc[total_series.index, leg] = total_series
            continue

        c = column_names.get(column)
        if c is not None:
            tmp = value_percentages(df, meta_data, c, meta_grids)
            if tmp.empty or tmp.shape[1] == 0:
                continue
            if not meta_grids.empty and c in meta_grids['question_name'].values:  # GRID case
                data = tmp
                return data
            else:
                tmp = tmp.iloc[:, 0]
                # Union indices so we never drop brands that appeared in earlier metrics
                data = data.reindex(data.index.union(tmp.index)).fillna(0)
                data.loc[tmp.index, leg] = tmp
                continue

            data = data.reindex(data.index.union(tmp.index)).fillna(0)
            data.loc[tmp.index, leg] = tmp

    return data



def build_brand_cards(data_store, project_inputs, item, meta_data, meta_grids):
    results = []
    df = data_store.get("decoded_raw_data").copy()
    loop_ques = project_inputs.get(item['inputs']['loop_question'])
    pivot_loop = normalize_one_hot_to_rows(df, brand_after_s_us=[loop_ques])
    purchase_funnel = process_multi_column_data(df, meta_data, item['inputs']['purchase_funnel'],
                                                project_inputs, meta_grids)
    value_cols = [c for c in pivot_loop.columns if c not in ('response_id', 'brand')]
    for brand in project_inputs.get(item['inputs']['focus_brands']) or []:
        # Use reindex to handle brands that may be missing from the purchase funnel due to zero selections
        pf = purchase_funnel.reindex([brand]).fillna(0)
        brand_loop = pivot_loop[pivot_loop['brand'] == brand]
        # Count only respondents who actually have a value for this brand (not all NaN)
        if value_cols:
            n_appearance = brand_loop.dropna(subset=value_cols, how='all').shape[0]
        else:
            n_appearance = len(brand_loop)
        why_mou = perc_of_all_values(brand_loop, meta_data, loop_ques, base_on_appearance=True)
        if not why_mou.empty and len(why_mou.columns) > 0:
            why_mou.sort_values(by=why_mou.columns[0], ascending=False, inplace=True)
        results.append({f"{brand} Brand Card": {"pf": pf, "why_mou": why_mou, "why_mou_n": n_appearance}})
    return results
