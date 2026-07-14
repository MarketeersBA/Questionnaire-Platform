# Brand Equity Analyzer (Python)

Python port of the **Marketeers Brand Equity Analyzer** (reverse‑engineered from the C# Windows Forms app).

## Features

- **Step 1**: Load CSV scores file (brand–attribute scores), choose score type (Un/Checked vs Scale data) and layout (brands within attributes / attributes within brands).
- **Step 2**: Enter attribute names, brand names, and (for check data) brand awareness counts.
- **Step 3**: Paste preference shares / purchase intent.
- **Step 4** (optional): Loyalty / MOU data.
- **Step 5** (optional): Correlation per respondents (segmentation variables).
- **Step 6** (optional): Segmentation (respondents, attributes, brands).
- **Step 7**: Choose output segmentation and run **Calculate**. Results appear in the text area and are exported to Excel (CBI, correlations, T‑values, POP/POD/Strong/Unassoc matrix, scores, normalized matrix, correlation per brand).

Additional tool: **Transposer Utility** to transpose score data (attributes × brands × respondents).

## Requirements

- Python 3.10+
- tkinter (usually included with Python)
- pandas, openpyxl, numpy

## Install

```bash
cd brand_equity_analyzer_python
pip install -r requirements.txt
```

## Run

```bash
python main.py
```

## Project layout

| File | Role |
|------|------|
| **`main.py`** | Entry point. Imports and runs `MainWindow`, then starts the tkinter main loop. Run this to launch the app. |
| **`main_window.py`** | Main wizard UI (ported from C# `frmBE`). Builds the 7-step wizard: frames, buttons, file dialogs, text areas for CSV/scores/preference shares/awareness/loyalty/correlation/segmentation. Parses user input, loads CSVs, calls `calculations` and `excel_engine`, shows results in a scrolled text area and triggers Excel export. Also opens the Transposer dialog. |
| **`calculations.py`** | Core brand-equity math. Helpers: `get_average`, `get_variance`, `get_stdev`, `get_correlation`, `count_occurrences`, `get_summation`, etc. Data shaping: `arr_one_d`, `arr_transform`, `arr_transform_new`. Correlations: `corr_calc`, `corr_per_brand`, `wt_t_calc`. Expected scores/shares: `get_expected_attribute_score`, `get_expected_attribute_share_from_check` / `_from_scalar`, `get_normalize_expected_attribute_share`. Main outputs: `calc_cbi`, `pop_pod_str_unass` (POP/POD/Strong/Unassoc matrix), `is_attribute_value_strong`, `is_attribute_value_pop`. |
| **`segment.py`** | Segmentation model. `Segment` class parses segment names and element lists from CSV-like text (`fill_segments`), stores segments and members, and provides `get_segmentation_indices`, `get_member_index_from_the_global_object`, `get_segmentation_type_with_member_name_array`. Used for respondent, attribute, and brand segmentation. |
| **`excel_engine.py`** | Excel export (replaces C# Interop.Excel). Singleton `ExcelEngine`: creates workbooks/sheets via openpyxl, `bind_to_worksheet` / `bind_to_worksheet_dataframe`, `apply_table_theme`, `apply_conditional_formatting`, `set_number_format`, `save(path)`. `get_excel_engine()` returns the shared instance. Writes CBI, correlations, T-values, POP/POD matrix, scores, normalized matrix, correlation per brand. |
| **`transposer_dialog.py`** | Transposer Utility (ported from C# `frmAppendScores`). Toplevel dialog: text area for raw score data, inputs for # attributes, # brands, # respondents, and a “Transpose” button. Reorganizes data from (respondents × attributes × brands) to the layout attributes × (brands × respondents) and outputs tab-separated lines. |
| **`requirements.txt`** | Python dependencies: `pandas`, `openpyxl`, `numpy` (with minimum versions). |

## Data format (same as original)

- **Scores CSV**: One row per respondent; cells are tab/comma separated. Layout matches “brands within attributes” or “attributes within brands” and the chosen score type (check vs scale).
- **Preference shares**: Flattened list of values (respondents × brands), same separators.
- **Brand awareness**: For check data, one column per (total + segments), same order as segmentation.

This port keeps the same workflow and formulas as the C# application; Excel output is written to a file you choose instead of opening Excel via COM.
