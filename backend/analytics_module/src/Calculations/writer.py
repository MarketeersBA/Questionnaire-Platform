# ---------- 2) Save to Excel (and optional Parquet) ----------
import re


def _sanitize_sheet_name(name: str) -> str:
    # Excel sheet name restrictions
    name = re.sub(r'[:\\/?*\[\]]', '_', name)  # invalid chars
    name = name.strip()
    if not name:
        name = "Sheet"
    return name[:_EXCEL_MAX_SHEETNAME]


from pathlib import Path
from typing import Dict, List, Mapping
import pandas as pd

# Assumes you already have these util(s) in your codebase:
_EXCEL_MAX_SHEETNAME = 31


# def _sanitize_sheet_name(name: str) -> str: ...

def write_section_excels(
        data_map: Dict,
        base_dir,
        excel_engine: str = "xlsxwriter",
        # New: filenames & keys to support the new structure
        data_stats_key: str = "Data_Stats",
        brand_analyzer_key: str = "Brand_Analyzer",
        data_stats_filename: str = "Data_Stats.xlsx",
        brand_analyzer_filename: str = "Brand_Analyzer.xlsx",
) -> Dict[str, str]:
    """
    Writes Excel files from chart data.

    Supports two shapes:

    1) NEW shape (recommended):
       {
         "Data_Stats":      [ {"Chart A": df_a}, {"Chart B": df_b}, ... ],
         "Brand_Analyzer":  [ {"Grid 1": df_bi1}, {"Grid 2": df_bi2}, ... ]
       }
       -> creates:
          base_dir/Data_Stats.xlsx       (one sheet per chart)
          base_dir/Brand_Analyzer.xlsx   (one sheet per analyzer table)

    2) LEGACY shape (backward compatible):
       {
         "Section 1": {"Chart A": df_a, "Chart B": df_b, ...},
         "Section 2": {"Chart C": df_c, ...},
         ...
       }

       -> creates one Excel per section: base_dir/Section 1.xlsx, etc.

    Returns:
      Dict[str, str] mapping logical keys/sections to written file paths.
    """

    base = Path(base_dir)
    base.mkdir(parents=True, exist_ok=True)
    written: Dict[str, str] = {}

    def _write_excel_from_items(items: List[Dict[str, pd.DataFrame]], path: Path):
        seen_sheet_names = set()
        with pd.ExcelWriter(path, engine=excel_engine) as writer:
            for item in items:
                for chart_name, df_chart in item.items():
                    print("Writing chart:", chart_name)
                    sheet = _sanitize_sheet_name(str(chart_name))
                    # de-dup if collision
                    original = sheet
                    i = 1
                    while sheet in seen_sheet_names:
                        suffix = f"_{i}"
                        sheet = original[:_EXCEL_MAX_SHEETNAME - len(suffix)] + suffix
                        i += 1
                    seen_sheet_names.add(sheet)
                    df_chart.to_excel(writer, sheet_name=sheet, index=True)

    # Detect NEW shape
    is_new_shape = (
            isinstance(data_map, Mapping)
            and (data_stats_key in data_map or brand_analyzer_key in data_map)
            and all(
        (isinstance(data_map.get(k, []), list) or data_map.get(k) is None)
        for k in (data_stats_key, brand_analyzer_key)
    )
    )

    if is_new_shape:
        # Data_Stats workbook
        data_stats_items = data_map.get(data_stats_key, [])
        if data_stats_items:
            ds_path = base / data_stats_filename
            _write_excel_from_items(data_stats_items, ds_path)
            written[data_stats_key] = str(ds_path)

        # Brand_Analyzer workbook
        ba_items = data_map.get(brand_analyzer_key, [])
        if ba_items:
            ba_path = base / brand_analyzer_filename
            _write_excel_from_items(ba_items, ba_path)
            written[brand_analyzer_key] = str(ba_path)

        return written

    # LEGACY shape: section -> { chart_name: df } -> one Excel per section, one sheet per chart
    for section, data in data_map.items():
        if not isinstance(data, Mapping):
            continue
        # Each value may be a single DataFrame (chart_name -> df) or nested (chart_name -> { sheet: df })
        items_for_excel: List[Dict[str, pd.DataFrame]] = []
        for chart_name, val in data.items():
            if isinstance(val, pd.DataFrame):
                items_for_excel.append({str(chart_name): val})
            elif isinstance(val, Mapping):
                for sheet_name, df_chart in val.items():
                    if isinstance(df_chart, pd.DataFrame):
                        items_for_excel.append({str(sheet_name): df_chart})
                    elif isinstance(df_chart, list):
                        for i, x in enumerate(df_chart):
                            if isinstance(x, pd.DataFrame):
                                items_for_excel.append({str(sheet_name) if len(df_chart) == 1 else f"{sheet_name}_{i}": x})
            # else skip non-df values
        if items_for_excel:
            safe_name = _sanitize_sheet_name(str(section))
            excel_path = base / f"{safe_name}.xlsx"
            _write_excel_from_items(items_for_excel, excel_path)
            written[section] = str(excel_path)

    return written


# ---------- 3) Read back from disk (Excel or Parquet) ----------
def read_section_excels(base_dir) -> Dict[str, Dict[str, pd.DataFrame]]:
    """
    Reads back the structure from Excel files in base_dir.
    {Section.xlsx} -> {sheet -> DataFrame}
    """
    base = Path(base_dir)
    result: Dict[str, Dict[str, pd.DataFrame]] = {}
    for xlsx in base.glob("*.xlsx"):
        section = xlsx.stem
        # read all sheets
        all_sheets = pd.read_excel(xlsx, sheet_name=None)
        result[section] = {sheet: df for sheet, df in all_sheets.items()}
    return result
