import pandas as pd

from backend.analytics_module.src.Calculations.percentages import value_percentages
from backend.analytics_module.src.common import get_question_type


def build_habits_opinions(item, data_store, meta_data, project_inputs):
    results = []
    groups = project_inputs[item["inputs"]]  # list of dicts: [{"Q1":"Title1","Q2":"Title2"}, {"Q3":""}]
    raw_df = data_store.get("decoded_raw_data")

    for group in groups:
        if isinstance(group, dict):
            questions = list(group.keys())
            titles = [(str(group.get(q) or "").strip()) or q for q in questions]  # "" or None → use question name
        else:
            questions = list(group)
            titles = questions

        data_list, types = [], []
        for question in questions:
            q_type = get_question_type(meta_data, question)
            is_sc = q_type == "Select (Radio Button)"
            is_mc = q_type == "Select (Check Box)"
            df = value_percentages(raw_df, meta_data, question)
            if not df.empty:
                col = df.columns[0]
                # Cap both SC and MC to the top 10 options by percentage.
                # Without this limit, a question with many unique values (e.g. a
                # budget question with 10+ ranges) writes too many series into the
                # chart's embedded Excel workbook, which corrupts the PPTX file
                # and causes PowerPoint to strip out all charts on repair.
                df = df.sort_values(by=col, ascending=False).head(10)
            data_list.append(df)
            types.append("sc" if is_sc else ("mc" if is_mc else ""))

        # Use title for single-question groups so the same question in different groups
        # (e.g. "WhenUseDates" → "Usage Occasions" vs "Usage Purpose") gets unique keys.
        if len(questions) == 1 and titles and (titles[0] or "").strip():
            key = (titles[0] or questions[0]).strip()
        else:
            key = " | ".join(questions)
        results.append({
            key: {
                "questions": questions,
                "titles": titles,
                "data": data_list,
                "types": types,
                "type_combo": "".join(types),  # "sc", "mc", "scsc", "scmc", "mcmc"
            }
        })
    return results
