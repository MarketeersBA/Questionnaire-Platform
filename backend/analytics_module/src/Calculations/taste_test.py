import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import ttest_ind

from backend.analytics_module.src.common.data_helpers import rescale_columns, get_scale_names  # noqa: F401 - re-exported


def compare_between_two(tt_data, brands, features, purchase_intent, ideal_is_3=None, ideal=None):
    top2box = [ideal, ideal - 1] if ideal else None

    tt_data = tt_data.loc[:, ~tt_data.columns.duplicated()].copy()

    needed_cols = list(dict.fromkeys(features + ['brand', 'response_id']))

    if isinstance(ideal_is_3, list):
        for f3 in ideal_is_3:
            if f3 in tt_data.columns:
                tt_data[f3] = 5 - abs(tt_data[f3] - 3)
    all_needed = list(dict.fromkeys(needed_cols + [purchase_intent]))
    fi = feature_importance(tt_data[all_needed], purchase_intent, corr=True)
    importance = fi.loc[features, "corr"]
    importance_sorted = importance.abs().sort_values(ascending=False)

    if len(brands) == 2:
        significance = ttests_by_brand(tt_data[needed_cols], brands, top_2_box=top2box).drop(columns=["t_stat"])
        significance = significance.set_index("feature").loc[importance_sorted.index]
        significance["importance"] = importance_sorted
        return significance

    # 3+ brands: averages only, no significance column
    result = averages_by_brand(tt_data[needed_cols], brands, top_2_box=top2box)
    result = result.set_index("feature").loc[importance_sorted.index]
    result["importance"] = importance_sorted
    return result


def build_comparison(item, comparators, project_inputs, data_store, meta_data, codebook_df):
    comparison_inputs = item.get('inputs', {})


    ideal = comparison_inputs['ideal']

    ideal_is_3 = project_inputs.get('ideal_is_3')
    purchase_intent = project_inputs[comparison_inputs['purchase_intent']]

    pivot_scalers = data_store.get('pivot_scalers').copy()

    if comparison_inputs['set_of_features'] == "of_most_important":
        c1 = compare_between_two(
            pivot_scalers.copy(),
            comparators,
            list(project_inputs['feature_map'].keys()),
            purchase_intent,
            ideal_is_3=ideal_is_3,
            ideal=ideal
        )

        features = project_inputs['feature_map'][c1.index.tolist()[0]]

    else:
        features = project_inputs[comparison_inputs['set_of_features']]

    comparison = compare_between_two(
        pivot_scalers.copy(),
        comparators,
        features,
        purchase_intent,
        ideal_is_3=ideal_is_3,
        ideal=ideal
    )

    scales_required = [1, ideal]
    if scales_required:
        for sc in scales_required:
            scale_nm = [get_scale_names(f, sc, meta_data, codebook_df) for f in comparison.index]
            comparison[f'scale{sc}'] = scale_nm

    return comparison


def feature_importance(Xy_df, y_col_name, lr=False, corr=False, keys=None):
    if keys is None:
        keys = ['response_id', 'brand']

    # 1) Clean X
    X = (
        Xy_df
        .drop(columns=[y_col_name], errors='ignore')
        .dropna(how='all')
        .replace([np.inf, -np.inf, np.nan], 0)
    )

    # 2) Build y
    unique_y_cols = list(dict.fromkeys(keys + [y_col_name]))
    y = (Xy_df.loc[:, unique_y_cols].copy())
    y[y_col_name] = pd.to_numeric(y[y_col_name], errors='coerce')
    y = y.replace([np.inf, -np.inf], np.nan).dropna(subset=[y_col_name])

    # 3) Merge - consider using 1:1 validation to avoid data leakage
    XY = X.merge(y, on=keys, how='inner', validate='1:1')  # Changed from m:1
    y_vec = XY.pop(y_col_name)
    X_final = XY.drop(columns=keys)

    # Add constant
    X_final = sm.add_constant(X_final, has_constant='add')
    X_final = X_final.astype(float)
    y_vec = y_vec.astype(float)

    if lr:
        res = sm.OLS(y_vec, X_final).fit()
        summary_table = pd.DataFrame({
            'coef': res.params,
            'std err': res.bse,
            't': res.tvalues,
            'p': res.pvalues
        })

    else:
        summary_table = pd.DataFrame(index=X_final.columns)

    if corr:
        X_no_const = X_final.drop(columns='const', errors='ignore')
        corr_series = X_no_const.corrwith(y_vec)
        corr_aligned = corr_series.reindex(summary_table.index)
        summary_table['corr'] = corr_aligned

    # Sorting
    if lr:
        sort_index = summary_table['t'].abs().sort_values(ascending=False).index
    elif corr:
        sort_index = summary_table['corr'].abs().sort_values(ascending=False).index
    else:
        sort_index = summary_table.index

    return summary_table.reindex(sort_index)

def ttests_by_brand(df, brands, brand_col='brand', top_2_box=None):
    features = df.columns.drop(brand_col)

    # brands = df[brand_col].unique()

    if len(brands) != 2:
        raise ValueError(f"Expected exactly two brands for t-test but there are {brands}")

    brand1, brand2 = brands[0], brands[1]
    group1 = df[df[brand_col] == brand1]
    group2 = df[df[brand_col] == brand2]

    results = []

    for feat in features:
        # t-test
        a = pd.to_numeric(group1[feat], errors="coerce").astype(float)
        b = pd.to_numeric(group2[feat], errors="coerce").astype(float)
        t_stat, p_val = ttest_ind(a, b, nan_policy="omit")
        # t_stat, p_val = ttest_ind(group1[feat], group2[feat], nan_policy='omit')
        row = {
            'feature': feat,
            't_stat': t_stat,
            'significance': p_val
        }
        # Optional: percentages of values in value_filter
        g1_vals = group1[feat].dropna()
        g2_vals = group2[feat].dropna()

        row[f'{brand1} avg score'] = (g1_vals.mean())

        row[f'{brand2} avg score'] = (g2_vals.mean())

        if top_2_box:
            row[f'{brand1} T2B'] = (g1_vals.isin(top_2_box).mean() * 100
                                    if len(g1_vals) > 0 else 0)

            row[f'{brand2} T2B'] = (g2_vals.isin(top_2_box).mean() * 100
                                    if len(g2_vals) > 0 else 0)

        results.append(row)

    return pd.DataFrame(results)


def averages_by_brand(df, brands, brand_col='brand', top_2_box=None):
    """
    Compute average score and optional T2B per feature per brand (no significance).
    Supports 2 or more brands. Used for 3+ brand comparators where pairwise t-tests are not run.
    """
    if not brands:
        return pd.DataFrame()

    features = df.columns.drop(brand_col)
    df = df[df[brand_col].isin(brands)]

    results = []
    for feat in features:
        row = {'feature': feat}
        for b in brands:
            group = df[df[brand_col] == b]
            vals = pd.to_numeric(group[feat], errors="coerce").dropna()
            row[f'{b} avg score'] = vals.mean() if len(vals) > 0 else np.nan
            if top_2_box is not None:
                row[f'{b} T2B'] = (vals.isin(top_2_box).mean() * 100) if len(vals) > 0 else 0
        results.append(row)

    return pd.DataFrame(results)

