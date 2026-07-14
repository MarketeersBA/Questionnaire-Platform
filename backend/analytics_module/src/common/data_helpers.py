"""Shared data transformation helpers used across calculations and pivots."""


def rescale_columns(df, columns, old_min, old_max, new_min=1, new_max=10):
    """Linearly rescale values in the given columns from [old_min, old_max] to [new_min, new_max]."""
    scale = (new_max - new_min) / (old_max - old_min)
    existing = [c for c in columns if c in df.columns]
    if existing:
        df[existing] = (df[existing] - old_min) * scale + new_min
    return df


def get_scale_names(feat, scale_num, meta_data, codebook_df):
    """Look up the human-readable scale label for a feature at a given scale number."""
    qname = feat + '1'
    lst = _get_question_plist(meta_data, qname)
    if not lst:
        lst = _get_question_plist(meta_data, feat)

    if not lst:
        return f"{feat} Scale {scale_num}"

    try:
        return codebook_df.iloc[scale_num - 1][lst]
    except (KeyError, IndexError):
        return f"{feat} Scale {scale_num}"


def _get_question_plist(meta_data, column):
    """Get the parent list (or list_name) for a question column."""
    if isinstance(column, str):
        row = meta_data[meta_data['question_name'] == column]
        if not row.empty:
            l = row.iloc[0]['parent_list']
            if not l:
                l = row.iloc[0]['list_name']
            return l
    return None
