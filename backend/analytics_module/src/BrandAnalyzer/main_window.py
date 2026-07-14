# Brand Equity Analyzer - Main window (ported from C# frmBE)
# pylint: disable=too-many-instance-attributes,too-many-locals,too-many-branches,too-many-statements

import io
import os
import re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from typing import List, Optional, Tuple, Union, Any

import pandas as pd

from .segment import Segment
from .excel_engine import ExcelEngine, StyleType, get_excel_engine
from .calculations2 import (
    arr_one_d,
    arr_transform,
    arr_transform_new,
    corr_calc,
    corr_per_brand,
    wt_t_calc,
    get_expected_attribute_score,
    get_expected_attribute_share_from_check,
    get_expected_attribute_share_from_scalar,
    get_normalize_expected_attribute_share,
    calc_cbi,
    pop_pod_str_unass,
    get_correlation,
    get_stdev,
    get_different_nums,
    count_occurrences,
    get_summation,
    get_number_count,
)
from .transposer_dialog import TransposerDialog

CHARS = re.compile(r"[\r\n\t,\x00]+")


def _split_remove_empty(text: str) -> List[str]:
    return [p.strip() for p in CHARS.split(text.strip()) if p.strip()]


def _split_keep_empty(text: str) -> List[str]:
    return [p.strip() for p in re.split(r"[\r\n\t,]+", text)]


# Default inputs for headless (idle) mode
# purchase_intent_path: CSV path (relative to this file's dir or absolute). If set and file exists, used instead of inline purchase_intent.
HEADLESS_DEFAULTS = {
    "scores_path": "D:/Z/User/Downloads/BAAAAAAAA/score.csv",
    "purchase_intent_path": "D:/Z/User/Downloads/BAAAAAAAA/sat.csv",
    "score_type": "check",
    "sheet_layout": "brands_within_attrs",
    "attributes": [
        "Trusted Brand",
        "Innovative Brand",
        "Expert Brand",
        "Famous Brand",
        "Youthful and Fun Brand",
        "Brand that uses natural ingredients",
        "I feel special when I use it",
        "Chic and elegant brand",
        "Value for price",
        "High quality",
        "Economical brand",
        "High Hyderation",
        "Suitable for my hair",
        "Treatment",
        "Reduce Frizz",
        "Reduce split Ends",
        "Strengthens",
        "Shiny",
        "Nice smell",
        "Reduce tangles",
        "Reduce hair loss",
        "has product variety",
    ],
    "brands": [
        "Eva",
        "Nefertari",
        "Clary",
        "Raw African",
        "BoBana",
        "BLESS",
    ],
    "brand_awareness": [204, 36, 72, 32, 73, 97],
}


def load_headless_data(config: dict) -> Tuple[pd.DataFrame, Union[pd.DataFrame, List[str]]]:
    """
    Read scores and purchase-intent from config. If config contains in-memory
    'scores_df' and 'pref_share' (or 'purchase_intent'), those are returned.
    Otherwise reads from scores_path and optional purchase_intent_path (CSVs).
    Returns (scores_df, pref_share_df_or_list) for use by headless mode.
    """
    if "scores_df" in config:
        scores_df = config["scores_df"]
        pref = config.get("pref_share") or config.get("purchase_intent")
        if pref is None:
            pref = []
        if isinstance(pref, pd.DataFrame):
            pref = pref.values.astype(str).flatten().tolist()
        return scores_df, pref

    base_dir = os.path.dirname(os.path.abspath(__file__))

    scores_path = config.get("scores_path", "")
    if not scores_path:
        raise ValueError("HEADLESS_DEFAULTS must set scores_path")
    if not os.path.isabs(scores_path):
        scores_path = os.path.join(base_dir, scores_path)
    if not os.path.isfile(scores_path):
        raise FileNotFoundError(f"Scores file not found: {scores_path}")
    scores_df = pd.read_csv(scores_path, header=None, dtype=str, keep_default_na=False, encoding="utf-8", on_bad_lines="skip")
    scores_df = scores_df.astype(str)

    pi_path = config.get("purchase_intent_path")
    if pi_path:
        if not os.path.isabs(pi_path):
            pi_path = os.path.join(base_dir, pi_path)
        if os.path.isfile(pi_path):
            # First row is column header; read into DataFrame
            pi_df = pd.read_csv(pi_path, header=0, dtype=str, keep_default_na=False, encoding="utf-8", on_bad_lines="skip")
            pi_df = pi_df.astype(str)
            print("pref_share (from file, DataFrame)")
            print(pi_df.head())
            print(pi_df.tail())
            print(pi_df.shape)
            print(pi_df.columns.tolist())
            print("-" * 10)
            print("scores_df")
            print(scores_df.head())
            print(scores_df.tail())
            print(scores_df.shape)
            print(scores_df.columns.tolist() if hasattr(scores_df.columns, 'tolist') else "no header")
            return scores_df, pi_df
        else:
            raw = config.get("purchase_intent", "") or ""
            pref_share = _split_remove_empty(raw)
    else:
        raw = config.get("purchase_intent", "") or ""
        pref_share = _split_remove_empty(raw)
    

    return scores_df, pref_share


def run_equity_from_data(
    attributes: List[str],
    brands: List[str],
    brand_awareness: List[int],
    scores_df: pd.DataFrame,
    pref_share: List[str],
    score_type: str = "check",
    sheet_layout: str = "brands_within_attrs",
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Run brand equity calculation from in-memory data (no GUI, no file I/O).
    Returns (cbi_df, dt_pop_df) as DataFrames for use by external callers (e.g. brand_analyzer).
    """
    config = {
        "scores_df": scores_df,
        "pref_share": pref_share,
        "attributes": attributes,
        "brands": brands,
        "brand_awareness": brand_awareness,
        "score_type": score_type,
        "sheet_layout": sheet_layout,
    }
    app = MainWindow(headless=True, headless_config=config)
    if not app._do_initial_check():
        raise ValueError(
            "Brand equity initial check failed. Check trace output above for the specific failure "
            "(e.g. preference share count must equal respondents × brands, brand awareness count, or scores shape)."
        )
    app._fill_output_segmentation_combos()
    app._run_calculation()
    if app._last_cbi is None or app._last_dt_pop is None:
        raise RuntimeError("Brand equity calculation did not produce cbi/dt_pop.")
    cbi_df = pd.DataFrame({"Brand": app._brand_names, "CBI": app._last_cbi})
    return cbi_df, app._last_dt_pop


class MainWindow(tk.Tk):
    def __init__(
        self,
        headless: bool = False,
        output_path: Optional[str] = None,
        headless_config: Optional[dict] = None,
    ):
        super().__init__()
        self.title("Brand Equity Analyzer V5.2")
        self.geometry("756x521")
        self.resizable(False, False)

        self._frame = 1
        self._all_attr_count = 0
        self._all_brand_count = 0
        self._all_respondent_count = 0
        self._seg_attr_count = 0
        self._seg_brand_count = 0
        self._seg_respondent_count = 0
        self._attributes: List[str] = []
        self._brand_names: List[str] = []
        self._pref_share: List[str] = []
        self._all_brand_awareness: List[int] = []
        self._respondent_segmentation: Optional[Segment] = None
        self._brand_segmentation: Optional[Segment] = None
        self._attribute_segmentation: Optional[Segment] = None
        self._current_respondent_segmentation: Optional[str] = None
        self._current_attribute_segmentation: Optional[str] = None
        self._current_brand_segmentation: Optional[str] = None
        self._last_cbi: Optional[List[float]] = None
        self._last_dt_pop: Optional[pd.DataFrame] = None

        self._headless = headless
        self._output_path = output_path

        self._build_ui()
        if headless:
            self.withdraw()
            if headless_config is not None:
                self._set_headless_defaults(headless_config)
            else:
                self._set_headless_defaults()
                self.after(150, self._run_headless)
        else:
            self._show_frame(1)

    def _build_ui(self):
        # Title
        title = tk.Label(
            self, text="Marketeers Brand Equity Analyzer",
            bg="#C00000", fg="white", font=("Tahoma", 12, "bold"), anchor="w", padx=5
        )
        title.pack(fill=tk.X, pady=(9, 0))

        # Bottom bar first so it stays visible (buttons + help)
        self._lbl_help = tk.Label(self, text="Help:", bg="#DCDCDC", relief=tk.SUNKEN, anchor="w", padx=4)
        self._lbl_help.pack(side=tk.BOTTOM, fill=tk.X, padx=12, pady=4)
        btn_row = tk.Frame(self)
        btn_row.pack(side=tk.BOTTOM, fill=tk.X, padx=12, pady=4)
        tk.Button(btn_row, text="Close", command=self.destroy).pack(side=tk.LEFT, padx=4)
        tk.Button(btn_row, text="Transposer Utility ...", command=self._open_transposer).pack(side=tk.LEFT, padx=4)
        self._btn_back = tk.Button(btn_row, text="<-- Back", command=self._on_back)
        self._btn_back.pack(side=tk.RIGHT, padx=4)
        self._btn_next = tk.Button(btn_row, text="Next -->", command=self._on_next)
        self._btn_next.pack(side=tk.RIGHT, padx=4)
        self._btn_finish = tk.Button(btn_row, text="Calculate", command=self._on_finish)
        self._btn_finish.pack(side=tk.RIGHT, padx=4)

        # Content area - stacked frames (above the bottom bar)
        self._content = tk.Frame(self)
        self._content.pack(fill=tk.BOTH, expand=True, padx=12, pady=8)

        # Step 1 - Scores
        self.grp_scores = tk.LabelFrame(self._content, text="Step 1 - Brand-Attribute Scores Input")
        self._row_scores = tk.Frame(self.grp_scores)
        self._row_scores.pack(fill=tk.X)
        tk.Label(self._row_scores, text="Scores file").pack(side=tk.LEFT, padx=(0, 4))
        self.text_scores_path = tk.Entry(self._row_scores, width=60, state="readonly")
        self.text_scores_path.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=4)
        tk.Button(self._row_scores, text="Browse", command=self._browse_scores).pack(side=tk.LEFT)
        self._score_type = tk.StringVar(value="check")
        f1 = tk.Frame(self.grp_scores)
        f1.pack(fill=tk.X, pady=4)
        tk.Radiobutton(f1, text="Un/Checked data", variable=self._score_type, value="check").pack(side=tk.LEFT, padx=8)
        tk.Radiobutton(f1, text="Scale data", variable=self._score_type, value="scalar").pack(side=tk.LEFT, padx=8)
        self._sheet_layout = tk.StringVar(value="brands_within_attrs")
        f2 = tk.Frame(self.grp_scores)
        f2.pack(fill=tk.X, pady=4)
        tk.Radiobutton(f2, text="brands within attributes", variable=self._sheet_layout, value="brands_within_attrs").pack(side=tk.LEFT, padx=8)
        tk.Radiobutton(f2, text="attributes within brands", variable=self._sheet_layout, value="attrs_within_brands").pack(side=tk.LEFT, padx=8)
        self.grp_scores.pack(fill=tk.BOTH, expand=True)

        # Step 2 - Brand/Attributes
        self.grp_ba = tk.LabelFrame(self._content, text="Step 2 - Brand and Attribute Names Input")
        row_ba = tk.Frame(self.grp_ba)
        row_ba.pack(fill=tk.BOTH, expand=True)
        tk.Label(row_ba, text="Attributes").grid(row=0, column=0, sticky="nw", padx=4, pady=4)
        self.txt_attributes = scrolledtext.ScrolledText(row_ba, width=28, height=18, wrap=tk.NONE)
        self.txt_attributes.grid(row=1, column=0, padx=4, pady=4)
        tk.Label(row_ba, text="Brands").grid(row=0, column=1, sticky="nw", padx=4, pady=4)
        self.txt_brands = scrolledtext.ScrolledText(row_ba, width=28, height=18, wrap=tk.NONE)
        self.txt_brands.grid(row=1, column=1, padx=4, pady=4)
        tk.Label(row_ba, text="Brands Awareness").grid(row=0, column=2, sticky="nw", padx=4, pady=4)
        self.txt_brand_awareness = scrolledtext.ScrolledText(row_ba, width=28, height=18, wrap=tk.NONE)
        self.txt_brand_awareness.grid(row=1, column=2, padx=4, pady=4)

        # Step 3 - Preference shares
        self.grp_pref = tk.LabelFrame(self._content, text="Step 3 - Preference Shares/Purchase Intent")
        self.txt_ps = scrolledtext.ScrolledText(self.grp_pref, width=90, height=20, wrap=tk.NONE)
        self.txt_ps.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        # Step 4 - Loyalty
        self.grp_loyalty = tk.LabelFrame(self._content, text="Step 4 - Loyalty - MOU (Optional)")
        self.txt_loyalty = scrolledtext.ScrolledText(self.grp_loyalty, width=90, height=20, wrap=tk.NONE)
        self.txt_loyalty.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        # Step 5 - Segments (optional)
        self.grp_segments = tk.LabelFrame(self._content, text="Step 5 - Correlation Per Respondents (Optional)")
        self._check_var1 = tk.BooleanVar(value=False)
        self._check_var2 = tk.BooleanVar(value=False)
        self._check_var3 = tk.BooleanVar(value=False)
        self._check_var4 = tk.BooleanVar(value=False)
        seg_row = tk.Frame(self.grp_segments)
        seg_row.pack(fill=tk.X)
        tk.Checkbutton(seg_row, variable=self._check_var1).pack(side=tk.LEFT, padx=4)
        self.var1_name = tk.Entry(seg_row, width=18)
        self.var1_name.pack(side=tk.LEFT, padx=4)
        self.txt_seg_var1 = scrolledtext.ScrolledText(self.grp_segments, width=20, height=12, wrap=tk.NONE)
        self.txt_seg_var1.pack(side=tk.LEFT, fill=tk.Y, padx=4, pady=4)
        tk.Checkbutton(seg_row, variable=self._check_var2).pack(side=tk.LEFT, padx=4)
        self.var2_name = tk.Entry(seg_row, width=18)
        self.var2_name.pack(side=tk.LEFT, padx=4)
        self.txt_seg_var2 = scrolledtext.ScrolledText(self.grp_segments, width=20, height=12, wrap=tk.NONE)
        self.txt_seg_var2.pack(side=tk.LEFT, fill=tk.Y, padx=4, pady=4)
        # Step 6 - Segmentation
        self.grp_segmentation = tk.LabelFrame(self._content, text="Step 6 - Segmentation (Optional)")
        tk.Label(self.grp_segmentation, text="Segmentation for:").pack(anchor="w", padx=4, pady=4)
        self._segmentation_combo = ttk.Combobox(
            self.grp_segmentation, values=["Respondents", "Attributes", "Brands"],
            state="readonly", width=25
        )
        self._segmentation_combo.pack(anchor="w", padx=4, pady=4)
        self._segmentation_combo.current(0)
        tk.Label(self.grp_segmentation, text="Segments Name").pack(anchor="w", padx=4, pady=2)
        self.txt_respondent_segment = scrolledtext.ScrolledText(self.grp_segmentation, width=45, height=6, wrap=tk.NONE)
        self.txt_respondent_segment.pack(fill=tk.X, padx=4, pady=4)
        tk.Label(self.grp_segmentation, text="Segment Elements").pack(anchor="w", padx=4, pady=2)
        self.txt_respondent_elements = scrolledtext.ScrolledText(self.grp_segmentation, width=45, height=6, wrap=tk.NONE)
        self.txt_respondent_elements.pack(fill=tk.X, padx=4, pady=4)
        seg_btn_row = tk.Frame(self.grp_segmentation)
        seg_btn_row.pack(fill=tk.X, pady=4)
        tk.Button(seg_btn_row, text="Next -->", command=self._on_next).pack(side=tk.RIGHT, padx=4)

        # Step 7 - Output segmentation + Output
        self.grp_segmentation_output = tk.LabelFrame(self._content, text="Use Segmentation For")
        out_row = tk.Frame(self.grp_segmentation_output)
        out_row.pack(fill=tk.X)
        tk.Label(out_row, text="Respondents:").pack(side=tk.LEFT, padx=4)
        self._combo_respondents = ttk.Combobox(out_row, width=20, state="readonly")
        self._combo_respondents.pack(side=tk.LEFT, padx=4)
        tk.Label(out_row, text="Attributes:").pack(side=tk.LEFT, padx=4)
        self._combo_attributes = ttk.Combobox(out_row, width=20, state="readonly")
        self._combo_attributes.pack(side=tk.LEFT, padx=4)
        tk.Label(out_row, text="Brands:").pack(side=tk.LEFT, padx=4)
        self._combo_brands = ttk.Combobox(out_row, width=20, state="readonly")
        self._combo_brands.pack(side=tk.LEFT, padx=4)

        self.grp_output = tk.LabelFrame(self._content, text="Analysis Output")
        out_inner = tk.Frame(self.grp_output)
        out_inner.pack(fill=tk.BOTH, expand=True)
        self.txt_output = scrolledtext.ScrolledText(out_inner, width=50, height=18, wrap=tk.NONE)
        self.txt_output.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=4, pady=4)
        # Table placeholder (simplified - just show text output; DataGrid could be added with ttk.Treeview)
        self._table_placeholder = tk.Frame(out_inner)
        self._table_placeholder.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=4, pady=4)

    def _show_frame(self, n: int):
        for w in (self.grp_scores, self.grp_ba, self.grp_pref, self.grp_loyalty,
                  self.grp_segments, self.grp_segmentation, self.grp_segmentation_output, self.grp_output):
            w.pack_forget()
        if n == 1:
            self.grp_scores.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(text="Help:")
        elif n == 2:
            self.grp_ba.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(
                text="Help: Awareness: Copy and Paste the awareness count for each brand; "
                     "first col = total sample, next cols = segments (same order as segmentation tab)."
            )
        elif n == 3:
            self.grp_pref.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(text="Help:")
        elif n == 4:
            self.grp_loyalty.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(text="Help:")
        elif n == 5:
            self.grp_segments.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(text="Help:")
        elif n == 6:
            self.grp_segmentation.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(text="Help:")
        elif n == 7:
            self.grp_segmentation_output.pack(fill=tk.X)
            self.grp_output.pack(fill=tk.BOTH, expand=True)
            self._lbl_help.config(text="Help:")
        self._frame = n
        self._btn_back.pack(side=tk.RIGHT, padx=4) if n > 1 else self._btn_back.pack_forget()
        if n == 7:
            self._btn_next.pack_forget()
            self._btn_finish.pack(side=tk.RIGHT, padx=4)
        else:
            # Steps 1-6: show Next, hide Calculate (so step 6 optional segmentation has Next)
            self._btn_finish.pack_forget()
            self._btn_next.pack(side=tk.RIGHT, padx=4)

    def _set_headless_defaults(self, config: Optional[dict] = None) -> None:
        """Set UI widgets and headless data from config or HEADLESS_DEFAULTS; loads CSVs or uses in-memory data."""
        d = config if config is not None else HEADLESS_DEFAULTS
        self._headless_scores_df, pref_share_data = load_headless_data(d)
        # If loaded from file, first row was header; flatten DataFrame to row-major list
        if isinstance(pref_share_data, pd.DataFrame):
            pref_share_list = pref_share_data.values.astype(str).flatten().tolist()
        else:
            pref_share_list = pref_share_data
        self._attributes = list(d["attributes"])
        self._all_attr_count = len(self._attributes)
        self._brand_names = list(d["brands"])
        self._all_brand_count = len(self._brand_names)
        self._all_brand_awareness = list(d["brand_awareness"])
        # Respondent count = min(scores rows, preference-based count) so we never require more pref values than we have
        scores_rows = self._headless_scores_df.shape[0]
        pref_respondents = len(pref_share_list) // self._all_brand_count if self._all_brand_count else 0
        self._all_respondent_count = min(scores_rows, pref_respondents) if pref_respondents else scores_rows
        need_pref = self._all_respondent_count * self._all_brand_count
        self._pref_share = list(pref_share_list[:need_pref])
        if scores_rows > self._all_respondent_count:
            self._headless_scores_df = self._headless_scores_df.iloc[: self._all_respondent_count].copy()
            print(f"[Trace] Headless: scores had {scores_rows} rows; trimmed to {self._all_respondent_count} to match preference share")
        if len(pref_share_list) > need_pref:
            print(f"[Trace] Purchase intent had {len(pref_share_list)} values; trimmed to {need_pref} (respondents * brands)")
        self.text_scores_path.config(state=tk.NORMAL)
        self.text_scores_path.delete(0, tk.END)
        self.text_scores_path.insert(0, d.get("scores_path", "(in-memory)"))
        self.text_scores_path.config(state="readonly")
        self._score_type.set(d.get("score_type", "check"))
        self._sheet_layout.set(d.get("sheet_layout", "brands_within_attrs"))
        self.txt_attributes.delete("1.0", tk.END)
        self.txt_attributes.insert("1.0", "\n".join(d["attributes"]))
        self.txt_brands.delete("1.0", tk.END)
        self.txt_brands.insert("1.0", "\n".join(d["brands"]))
        self.txt_brand_awareness.delete("1.0", tk.END)
        self.txt_brand_awareness.insert("1.0", "\n".join(str(x) for x in d["brand_awareness"]))
        self.txt_ps.delete("1.0", tk.END)
        self.txt_ps.insert("1.0", ",".join(self._pref_share))
        # Step 4–6 optional: leave loyalty and segments empty

    def _run_headless(self) -> None:
        """Run calculation in headless mode then quit."""
        try:
            if not self._do_initial_check():
                print("Headless run: validation failed.")
                self.quit()
                return
            self._fill_output_segmentation_combos()
            self._run_calculation()
        except Exception as e:
            print(f"Headless run error: {e}")
            import traceback
            traceback.print_exc()
        self.quit()

    def _browse_scores(self):
        path = filedialog.askopenfilename(
            title="CSV scores file chooser",
            initialdir="C:\\",
            filetypes=[("CSV files (*.csv)", "*.csv"), ("All files", "*.*")]
        )
        if path:
            self.text_scores_path.config(state=tk.NORMAL)
            self.text_scores_path.delete(0, tk.END)
            self.text_scores_path.insert(0, path)
            self.text_scores_path.config(state="readonly")

    def _on_back(self):
        self._frame -= 1
        self._show_frame(self._frame)

    def _on_next(self):
        if self._frame == 6:
            if not self._do_initial_check():
                return
            self._fill_output_segmentation_combos()
        self._frame += 1
        self._show_frame(self._frame)

    def _fill_output_segmentation_combos(self):
        if self._respondent_segmentation:
            arr = self._respondent_segmentation.get_segmentation_type_with_member_name_array()
            self._combo_respondents["values"] = arr
            self._combo_respondents.current(0)
        if self._attribute_segmentation:
            arr = self._attribute_segmentation.get_segmentation_type_with_member_name_array()
            self._combo_attributes["values"] = arr
            self._combo_attributes.current(0)
        if self._brand_segmentation:
            arr = self._brand_segmentation.get_segmentation_type_with_member_name_array()
            self._combo_brands["values"] = arr
            self._combo_brands.current(0)

    def _do_initial_check(self) -> bool:
        path = self.text_scores_path.get().strip()
        err = lambda msg: print(msg) if getattr(self, "_headless", False) else messagebox.showerror("Error", msg)
        if self._headless:
            # Headless: _headless_scores_df, _pref_share, _all_respondent_count already set in _set_headless_defaults
            if getattr(self, "_headless_scores_df", None) is None or not self._attributes or not self._brand_names:
                err("Sorry, Data is missing, you have to fill all fields")
                return False
        else:
            attrs_t = self.txt_attributes.get("1.0", tk.END).strip()
            brands_t = self.txt_brands.get("1.0", tk.END).strip()
            if not attrs_t or not brands_t or not path:
                err("Sorry, Data is missing, you have to fill all fields")
                self._show_frame(1)
                return False
            self._attributes = _split_remove_empty(attrs_t.replace("\r\n", "\n"))
            self._all_attr_count = len(self._attributes)
            self._brand_names = _split_remove_empty(brands_t.replace("\r\n", "\n"))
            self._all_brand_count = len(self._brand_names)
            self._pref_share = _split_remove_empty(self.txt_ps.get("1.0", tk.END))
            self._all_respondent_count = (len(self._pref_share)) // self._all_brand_count
        print(f"[Trace] Preference share: {len(self._pref_share)} values, {self._all_brand_count} brands -> {self._all_respondent_count} respondents")
        if self._all_respondent_count * self._all_brand_count != len(self._pref_share):
            err("Preference shares count must equal respondents * brands")
            return False
        self._respondent_segmentation = Segment(
            "Respondent", self._all_respondent_count,
            self.txt_respondent_segment.get("1.0", tk.END),
            self.txt_respondent_elements.get("1.0", tk.END)
        )
        self._brand_segmentation = Segment(
            "Brand", self._all_brand_count,
            "", ""
        )
        self._attribute_segmentation = Segment(
            "Attribute", self._all_attr_count,
            "", ""
        )
        if self._score_type.get() == "check":
            if not self._headless:
                ba_text = self.txt_brand_awareness.get("1.0", tk.END)
                self._all_brand_awareness = [int(x) for x in _split_remove_empty(ba_text)]
            expected_len = self._all_brand_count * (self._respondent_segmentation.member_count + 1)
            if len(self._all_brand_awareness) != expected_len:
                err(f"Brand Awareness columns count must equal {expected_len}")
                if not getattr(self, "_headless", False):
                    self._show_frame(1)
                return False
        if self._headless:
            df = self._headless_scores_df
            file_respondent_count = df.shape[0]
            n_cols = self._all_attr_count * self._all_brand_count
            if df.shape[1] < n_cols:
                err("Sorry the scores data wasn't complete")
                return False
            print(f"[Trace] Scores DataFrame: {file_respondent_count} data rows (expected {self._all_respondent_count} from preference share)")
            if file_respondent_count != self._all_respondent_count:
                need_cells = file_respondent_count * self._all_brand_count
                if len(self._pref_share) < need_cells:
                    err(
                        f"Preference has {len(self._pref_share)} values but need "
                        f"{need_cells} for {file_respondent_count} respondents x {self._all_brand_count} brands."
                    )
                    return False
                self._all_respondent_count = file_respondent_count
                self._pref_share = self._pref_share[:need_cells]
                self._respondent_segmentation.element_count = file_respondent_count
                print(f"[Trace] Headless: scores has {file_respondent_count} rows -> respondent count set to {file_respondent_count}")
        else:
            if not os.path.isfile(path):
                err("Scores file not found")
                return False
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            line_check = content.replace("\r\n", "\t").replace("\n", "\t").replace(",", "\t")
            parts = _split_keep_empty(line_check)
            if len(parts) < self._all_attr_count * self._all_brand_count:
                err("Sorry the scores file wasn't complete")
                self._show_frame(1)
                return False
            lines = content.splitlines()
            file_respondent_count = len(lines)
            print(f"[Trace] Scores file: {file_respondent_count} data rows (expected {self._all_respondent_count} from preference share)")
            if file_respondent_count != self._all_respondent_count:
                err("Sorry the number of respondents in the scores file isn't correct")
                self._show_frame(1)
                return False
        return True

    def _open_transposer(self):
        TransposerDialog(self)

    def _on_finish(self):
        if not self._do_initial_check():
            return
        try:
            self._run_calculation()
        except Exception as e:
            messagebox.showerror("Error", str(e))
            import traceback
            traceback.print_exc()

    def _run_calculation(self):
        path = self.text_scores_path.get().strip()
        resp_sel = self._combo_respondents.get().strip()
        attr_sel = self._combo_attributes.get().strip()
        brand_sel = self._combo_brands.get().strip()
        seg_attr_idx = self._attribute_segmentation.get_segmentation_indices(attr_sel) if self._attribute_segmentation else list(range(self._all_attr_count))
        seg_brand_idx = self._brand_segmentation.get_segmentation_indices(brand_sel) if self._brand_segmentation else list(range(self._all_brand_count))
        seg_resp_idx = self._respondent_segmentation.get_segmentation_indices(resp_sel) if self._respondent_segmentation else list(range(self._all_respondent_count))

        print(f"[Trace] Total respondents (from preference share): {self._all_respondent_count}")
        print(f"[Trace] After respondent segmentation (selection: {resp_sel!r}): {len(seg_resp_idx)} respondents")

        seg_resp_idx = self._exclude_respondents_zero_pref(seg_resp_idx, seg_brand_idx)
        self._seg_attr_count = len(seg_attr_idx)
        self._seg_brand_count = len(seg_brand_idx)
        self._seg_respondent_count = len(seg_resp_idx)

        brand_utility = self._get_brand_utility(seg_resp_idx, seg_brand_idx)
        ut_one_d = arr_one_d(brand_utility, self._seg_respondent_count, self._seg_brand_count)
        scores_df = getattr(self, "_headless_scores_df", None) if self._headless else None
        scores_2d = self._get_scores(path, seg_resp_idx, seg_brand_idx, seg_attr_idx, scores_df=scores_df)
        if self._sheet_layout.get() == "brands_within_attrs":
            scores_transform = arr_transform(scores_2d, self._seg_attr_count, self._seg_brand_count, self._seg_respondent_count)
        else:
            scores_transform = arr_transform_new(scores_2d, self._seg_attr_count, self._seg_brand_count, self._seg_respondent_count)

        corr = corr_calc(scores_transform, ut_one_d, self._seg_attr_count, self._seg_respondent_count, self._seg_brand_count)
        corr_per_br = corr_per_brand(scores_2d, brand_utility, self._seg_attr_count, self._seg_brand_count, self._seg_respondent_count)
        wt_t = wt_t_calc(corr, self._seg_attr_count, self._seg_respondent_count)

        if self._score_type.get() == "check":
            check_freq = self._get_check_frequencies(scores_2d)
            total_checks = sum(check_freq[i][j] for i in range(self._seg_attr_count) for j in range(self._seg_brand_count))
            if total_checks == 0:
                raise ValueError(
                    "Total check count is zero: scores may be empty or not numeric (use 0/1 or 0.0/1.0). "
                    "Check that score columns are in brands_within_attrs order and contain check data."
                )
            prob_attr = self._get_probability_attribute_checks(check_freq, total_checks)
            prob_brand = self._get_probability_brand_checks(check_freq, total_checks)
            expected_score = get_expected_attribute_score(prob_attr, prob_brand, self._seg_attr_count, self._seg_brand_count, float(total_checks))
            expected_share = get_expected_attribute_share_from_check(check_freq, expected_score, self._seg_attr_count, self._seg_brand_count)
            norm_expected = get_normalize_expected_attribute_share(expected_share, self._seg_attr_count, self._seg_brand_count)
            seg_awareness = self._get_segmented_brand_awareness(resp_sel, seg_brand_idx)
            freq_pct = [[float(check_freq[j][i]) / seg_awareness[i] for i in range(self._seg_brand_count)] for j in range(self._seg_attr_count)]
            cbi = calc_cbi(norm_expected, freq_pct, wt_t, self._seg_attr_count, self._seg_brand_count)
            table_list = self._print_output_check(seg_attr_idx, seg_brand_idx, check_freq, freq_pct, expected_share, corr_per_br)
        else:
            scalar_freq = self._get_scalar_frequencies(scores_2d)
            avg_scalar = sum(scalar_freq[i][j] for i in range(self._seg_attr_count) for j in range(self._seg_brand_count)) / (self._seg_attr_count * self._seg_brand_count)
            prob_attr_s = self._get_probability_attribute_scalar(scalar_freq, avg_scalar)
            prob_brand_s = self._get_probability_brand_scalar(scalar_freq, avg_scalar)
            expected_score = get_expected_attribute_score(prob_attr_s, prob_brand_s, self._seg_attr_count, self._seg_brand_count, avg_scalar)
            expected_share = get_expected_attribute_share_from_scalar(scalar_freq, expected_score, self._seg_attr_count, self._seg_brand_count)
            norm_expected = get_normalize_expected_attribute_share(expected_share, self._seg_attr_count, self._seg_brand_count)
            cbi = calc_cbi(norm_expected, scalar_freq, wt_t, self._seg_attr_count, self._seg_brand_count)
            table_list = self._print_output_scalar(seg_attr_idx, seg_brand_idx, scalar_freq, expected_share, corr_per_br)

        dt_pop = pop_pod_str_unass(seg_attr_idx, seg_brand_idx, expected_share, self._attributes, self._brand_names, self._seg_attr_count, self._seg_brand_count)

        if getattr(self, "_headless", False):
            self._last_cbi = cbi
            self._last_dt_pop = dt_pop

        self.txt_output.delete("1.0", tk.END)
        out_lines = ["CBI :\r\n"]
        for idx in range(self._seg_brand_count):
            out_lines.append(f"{self._brand_names[seg_brand_idx[idx]]}\t{round(cbi[idx], 3)}\r\n")
        out_lines.append("---------------------------------------\r\n\tCorrelation\tT-Value\r\n")
        for idx in range(self._seg_attr_count):
            out_lines.append(f"{self._attributes[seg_attr_idx[idx]]}\t{round(corr[idx] * 100.0, 7)}%\t{wt_t[idx]}\r\n")
        self.txt_output.insert("1.0", "".join(out_lines))

        excel = get_excel_engine()
        excel.start_new_excel_app()
        excel.add_new_sheet()
        brand_names_sel = [self._brand_names[seg_brand_idx[i]] for i in range(self._seg_brand_count)]
        excel.bind_to_worksheet(
            self._seg_brand_count,
            ["#", "Brand:", "CBI"],
            [list(range(1, self._seg_brand_count + 1)), brand_names_sel, cbi]
        )
        excel.apply_table_theme("TableStyleMedium9", True)
        excel.add_new_sheet()
        attr_names_sel = [self._attributes[seg_attr_idx[i]] for i in range(self._seg_attr_count)]
        excel.bind_to_worksheet(
            self._seg_attr_count,
            [" ", "  ", "Correlation", "T-Value"],
            [list(range(1, self._seg_attr_count + 1)), attr_names_sel, [round(corr[i] * 100, 7) for i in range(self._seg_attr_count)], wt_t]
        )
        excel.apply_table_theme("TableStyleMedium9", True)
        excel.add_new_sheet()
        excel.bind_to_worksheet_dataframe(dt_pop)
        excel.apply_conditional_formatting("POP", StyleType.INTERIOR, 49407.0)
        excel.apply_conditional_formatting("POD", StyleType.INTERIOR, 10147522.0)
        excel.apply_conditional_formatting("Strong", StyleType.INTERIOR, 15853019.0)
        excel.apply_conditional_formatting("Unassoc", StyleType.FONT, 3487637.0)
        excel.apply_table_theme("TableStyleLight15", False)
        for df in table_list:
            excel.add_new_sheet()
            excel.bind_to_worksheet_dataframe(df)
            excel.apply_table_theme("TableStyleMedium9", True)
        if getattr(self, "_headless", False):
            out_path = self._output_path
            if not out_path:
                score_dir = os.path.dirname(self.text_scores_path.get().strip())
                out_path = os.path.join(score_dir, "brand_equity_output.xlsx")
            excel.save(out_path)
            print(f"Results saved to {out_path}")
        else:
            out_path = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")])
            if out_path:
                excel.save(out_path)
                messagebox.showinfo("Done", f"Results saved to {out_path}")

    def _exclude_respondents_zero_pref(self, respondent_indexes: List[int], seg_brand_indexes: List[int]) -> List[int]:
        to_remove = []
        idx = 0
        for i in range(self._all_respondent_count):
            s = 0.0
            for j in range(self._all_brand_count):
                if j in seg_brand_indexes:
                    try:
                        s += float(self._pref_share[idx])
                    except (ValueError, IndexError):
                        pass
                idx += 1
            if s == 0.0:
                to_remove.append(i)
        kept = [x for x in respondent_indexes if x not in to_remove]
        removed_in_segment = len(respondent_indexes) - len(kept)
        print(f"[Trace] Zero-preference exclusion: removed {removed_in_segment} respondents (pref=0 for selected brands), remaining {len(kept)}")
        return kept

    def _rebase_brand_utility(self, brand_utility: List[List[float]]) -> List[List[float]]:
        for i in range(self._seg_respondent_count):
            total = sum(brand_utility[i][j] for j in range(self._seg_brand_count))
            if total:
                for k in range(self._seg_brand_count):
                    brand_utility[i][k] = brand_utility[i][k] * 100.0 / total
        return brand_utility

    def _get_brand_utility(self, respondent_indexes: List[int], brand_indexes: List[int]) -> List[List[float]]:
        arr = [[0.0] * self._seg_brand_count for _ in range(self._seg_respondent_count)]
        num = 0
        out_row = 0
        for i in range(self._all_respondent_count):
            if i not in respondent_indexes:
                num += self._all_brand_count
                continue
            col = 0
            for j in range(self._all_brand_count):
                if j in brand_indexes:
                    try:
                        arr[out_row][col] = float(self._pref_share[num])
                    except (ValueError, IndexError):
                        pass
                    col += 1
                num += 1
            out_row += 1
        return self._rebase_brand_utility(arr)

    def _get_scores(
        self,
        path: str,
        respondent_indexes: List[int],
        brand_indexes: List[int],
        attribute_indexes: List[int],
        scores_df: Optional[pd.DataFrame] = None,
    ) -> List[List[str]]:
        if scores_df is not None:
            df = scores_df
        else:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            normalized = content.replace("\r\n", "\t").replace("\r", "\t").replace("\n", "\t").replace(",", "\t")
            n_rows = self._all_respondent_count
            n_cols = self._all_attr_count * self._all_brand_count
            n_cells = n_rows * n_cols
            raw = pd.read_csv(io.StringIO(normalized), sep="\t", header=None, dtype=str, keep_default_na=False)
            flat = raw.values.flatten()
            cells = (list(flat) + [""] * n_cells)[:n_cells]
            df = pd.DataFrame([cells[i * n_cols:(i + 1) * n_cols] for i in range(n_rows)])
        if self._sheet_layout.get() == "brands_within_attrs":
            col_indices = [a * self._all_brand_count + b for a in attribute_indexes for b in brand_indexes]
        else:
            col_indices = [b * self._all_attr_count + m for b in brand_indexes for m in attribute_indexes]
        out = df.iloc[list(respondent_indexes), col_indices]
        print(f"Loaded scores for {len(respondent_indexes)} respondents, {len(attribute_indexes)} attributes, {len(brand_indexes)} brands.")
        print(f"First few rows of scores:\n{out}")

        # Trace first column of debug_scores.csv: what it is and why its sum is what it is
        first_col_idx = col_indices[0]
        if self._sheet_layout.get() == "brands_within_attrs":
            attr_idx = first_col_idx // self._all_brand_count
            brand_idx = first_col_idx % self._all_brand_count
        else:
            brand_idx = first_col_idx // self._all_attr_count
            attr_idx = first_col_idx % self._all_attr_count
        attr_name = self._attributes[attr_idx] if attr_idx < len(self._attributes) else f"attr[{attr_idx}]"
        brand_name = self._brand_names[brand_idx] if brand_idx < len(self._brand_names) else f"brand[{brand_idx}]"
        first_col = out.iloc[:, 0]
        first_numeric = pd.to_numeric(first_col, errors="coerce")
        n_valid = first_numeric.notna().sum()
        n_non_empty = first_col.astype(str).str.strip().ne("").sum()
        sum_first = float(first_numeric.sum())
        print(f"[Trace] debug_scores.csv first column: attribute={attr_name!r}, brand={brand_name!r} (grid col index {first_col_idx})")
        print(f"[Trace] First column: rows={len(first_col)}, non_empty={n_non_empty}, numeric={n_valid}, sum={sum_first}")

        out.to_csv("debug_scores.csv", index=False)  # Save to CSV for debugging
        return out.astype(str).values.tolist()

    def _get_check_frequencies(self, scores: List[List[str]]) -> List[List[int]]:
        arr = [[0] * self._seg_brand_count for _ in range(self._seg_attr_count)]
        if self._sheet_layout.get() == "brands_within_attrs":
            count = 0
            count1 = 0
            for i in range(self._seg_attr_count * self._seg_brand_count):
                if count >= self._seg_attr_count:
                    break
                if count1 == self._seg_brand_count:
                    count1 = 0
                    count += 1
                s = 0
                for j in range(self._seg_respondent_count):
                    if j < len(scores) and i < len(scores[0]) and (scores[j][i] or "").strip():
                        try:
                            s += int(float(scores[j][i]))
                        except (ValueError, TypeError):
                            pass
                if count < self._seg_attr_count and count1 < self._seg_brand_count:
                    arr[count][count1] = s
                count1 += 1
        else:
            count = 0
            count1 = 0
            for num in range(self._seg_attr_count * self._seg_brand_count):
                if count1 == self._seg_attr_count:
                    count1 = 0
                    count += 1
                s = 0
                for k in range(self._seg_respondent_count):
                    if k < len(scores) and num < len(scores[0]) and (scores[k][num] or "").strip():
                        try:
                            s += int(float(scores[k][num]))
                        except (ValueError, TypeError):
                            pass
                if count1 < self._seg_attr_count and count < self._seg_brand_count:
                    arr[count1][count] = s
                count1 += 1
                num += 1
        return arr

    def _get_scalar_frequencies(self, scores: List[List[str]]) -> List[List[float]]:
        arr = [[0.0] * self._seg_brand_count for _ in range(self._seg_attr_count)]
        if self._sheet_layout.get() == "brands_within_attrs":
            count = 0
            count1 = 0
            for i in range(self._seg_attr_count * self._seg_brand_count):
                if count >= self._seg_attr_count:
                    break
                if count1 == self._seg_brand_count:
                    count1 = 0
                    count += 1
                s = 0
                n = 0
                for j in range(self._seg_respondent_count):
                    if j < len(scores) and i < len(scores[0]) and (scores[j][i] or "").strip():
                        try:
                            s += int(float(scores[j][i]))
                            n += 1
                        except (ValueError, TypeError):
                            pass
                if count < self._seg_attr_count and count1 < self._seg_brand_count:
                    arr[count][count1] = (s / n) if n else 0.0
                count1 += 1
        else:
            count = 0
            count1 = 0
            for num in range(self._seg_attr_count * self._seg_brand_count):
                if count1 == self._seg_attr_count:
                    count1 = 0
                    count += 1
                s = 0
                n = 0
                for k in range(self._seg_respondent_count):
                    if k < len(scores) and num < len(scores[0]) and (scores[k][num] or "").strip():
                        try:
                            s += int(float(scores[k][num]))
                            n += 1
                        except (ValueError, TypeError):
                            pass
                if count1 < self._seg_attr_count and count < self._seg_brand_count:
                    arr[count1][count] = (s / n) if n else 0.0
                count1 += 1
                num += 1
        return arr

    def _get_probability_attribute_checks(self, check_frequencies: List[List[int]], sum_all: int) -> List[float]:
        return [
            sum(check_frequencies[i][j] for j in range(self._seg_brand_count)) / sum_all
            for i in range(self._seg_attr_count)
        ]

    def _get_probability_brand_checks(self, check_frequencies: List[List[int]], sum_all: int) -> List[float]:
        return [
            sum(check_frequencies[j][i] for j in range(self._seg_attr_count)) / sum_all
            for i in range(self._seg_brand_count)
        ]

    def _get_probability_attribute_scalar(self, scalar_frequencies: List[List[float]], average_all: float) -> List[float]:
        return [
            sum(scalar_frequencies[i][j] for j in range(self._seg_brand_count)) / self._seg_brand_count / average_all
            for i in range(self._seg_attr_count)
        ]

    def _get_probability_brand_scalar(self, scalar_frequencies: List[List[float]], average_all: float) -> List[float]:
        return [
            sum(scalar_frequencies[j][i] for j in range(self._seg_attr_count)) / self._seg_attr_count / average_all
            for i in range(self._seg_brand_count)
        ]

    def _get_respondents_segmentation_brand_awareness(self, segments_count: int, respondent_segment_index: int) -> List[int]:
        arr = [0] * self._all_brand_count
        start = (respondent_segment_index + 1) if respondent_segment_index != -1 else 0
        idx = 0
        i = start
        while i < len(self._all_brand_awareness):
            try:
                arr[idx] = self._all_brand_awareness[i]
            except IndexError:
                pass
            idx += 1
            i += segments_count + 1
        return arr

    def _get_segmented_brand_awareness(self, resp_sel: str, seg_brands_index: List[int]) -> List[int]:
        member_idx = self._respondent_segmentation.get_member_index_from_the_global_object(resp_sel) if self._respondent_segmentation else -1
        seg_count = self._respondent_segmentation.member_count if self._respondent_segmentation else 0
        full = self._get_respondents_segmentation_brand_awareness(seg_count, member_idx)
        return [full[i] for i in seg_brands_index if i < len(full)]

    def _print_output_check(
        self, attribute_indexes: List[int], brand_indexes: List[int],
        freq: List[List[int]], pct_awareness: List[List[float]], step_three: List[List[float]], corr_per_br: List[List[float]]
    ) -> List[pd.DataFrame]:
        cols = ["#", "Brands"] + [self._brand_names[brand_indexes[i]] for i in range(self._seg_brand_count)]
        list_dfs: List[pd.DataFrame] = []
        df_scores = pd.DataFrame(columns=cols)
        df_scores = df_scores.rename(columns={"Brands": "Scores"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [freq[j][k] for k in range(self._seg_brand_count)]
            df_scores.loc[j] = row[: len(cols)]
        list_dfs.append(df_scores)
        df_norm = pd.DataFrame(columns=cols)
        df_norm = df_norm.rename(columns={"Brands": "Normalized Matrix"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [step_three[j][k] for k in range(self._seg_brand_count)]
            df_norm.loc[j] = row[: len(cols)]
        list_dfs.append(df_norm)
        df_pct = pd.DataFrame(columns=cols)
        df_pct = df_pct.rename(columns={"Brands": "Percentage of Respondents Awareness"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [pct_awareness[j][k] for k in range(self._seg_brand_count)]
            df_pct.loc[j] = row[: len(cols)]
        list_dfs.append(df_pct)
        df_corr = pd.DataFrame(columns=cols)
        df_corr = df_corr.rename(columns={"Brands": "Correlation Per Brand"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [corr_per_br[j][k] for k in range(self._seg_brand_count)]
            df_corr.loc[j] = row[: len(cols)]
        list_dfs.append(df_corr)
        return list_dfs

    def _print_output_scalar(
        self, attribute_indexes: List[int], brand_indexes: List[int],
        freq: List[List[float]], step_three: List[List[float]], corr_per_br: List[List[float]]
    ) -> List[pd.DataFrame]:
        cols = ["#", "Brands"] + [self._brand_names[brand_indexes[i]] for i in range(self._seg_brand_count)]
        list_dfs = []
        df_scores = pd.DataFrame(columns=cols)
        df_scores = df_scores.rename(columns={"Brands": "Scores"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [freq[j][k] for k in range(self._seg_brand_count)]
            df_scores.loc[j] = row[: len(cols)]
        list_dfs.append(df_scores)
        df_norm = pd.DataFrame(columns=cols)
        df_norm = df_norm.rename(columns={"Brands": "Normalized Matrix"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [step_three[j][k] for k in range(self._seg_brand_count)]
            df_norm.loc[j] = row[: len(cols)]
        list_dfs.append(df_norm)
        df_corr = pd.DataFrame(columns=cols)
        df_corr = df_corr.rename(columns={"Brands": "Correlation Per Brand"})
        for j in range(self._seg_attr_count):
            row = [j + 1, self._attributes[attribute_indexes[j]]] + [corr_per_br[j][k] for k in range(self._seg_brand_count)]
            df_corr.loc[j] = row[: len(cols)]
        list_dfs.append(df_corr)
        return list_dfs
