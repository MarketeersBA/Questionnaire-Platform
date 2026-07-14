import pandas as pd

from backend.analytics_module.src.common import get_question_type
from backend.analytics_module.src.Calculations.percentages import value_percentages


def build_cross_tabs(item, data_store, meta_data, project_inputs):
    results = []

    ct_inputs = project_inputs[item['inputs']]
    groups = ct_inputs['groups']

    for group in groups:
        grouped = data_store.get("decoded_raw_data").copy().groupby(group)
        segments = ["Total"] + list(grouped.groups.keys())

        bases = {
            "Total": len(data_store.get("decoded_raw_data")),
            **{s: len(grouped.get_group(s)) for s in segments if s != "Total"}
        }

        for metric in ct_inputs['metrics']:
            # Skip loop questions
            metric_row = meta_data[meta_data["question_name"] == metric]
            if not metric_row.empty and "loop" in metric_row.columns:
                loop_val = metric_row.iloc[0].get("loop")
                if pd.notna(loop_val) and str(loop_val).strip():
                    continue
            # Determine question type (SC or MC)
            question_type = get_question_type(meta_data, metric)
            is_sc = question_type == 'Select (Radio Button)'

            data = pd.DataFrame()
            for segment in segments:
                seg_df = (
                    data_store.get("decoded_raw_data")
                    if segment == "Total"
                    else grouped.get_group(segment)
                )
                data[segment] = value_percentages(seg_df, meta_data, metric).iloc[:, 0]
            if not is_sc:
                data = data.sort_values(by="Total", ascending=False).head(7).iloc[::-1]
            elif is_sc:
                data = data.sort_values(by="Total", ascending=False).head(7)
            # Question text from meta_data (header) for subtitle on slide
            question_text = None
            row = meta_data[meta_data["question_name"] == metric]
            if not row.empty and "header" in row.columns:
                val = row.iloc[0].get("header")
                if pd.notna(val) and str(val).strip():
                    question_text = str(val).strip()
            results.append({
                f"{metric} by {group}": {
                    "data": data,
                    "bases": bases,
                    "segments": segments,
                    "is_sc": is_sc,
                    "question_text": question_text,
                }
            })

    return results
