import sys
import io

# Fix for PyInstaller windowed mode
if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

import json
import os
import datetime
from pathlib import Path
import pandas as pd
from pptx import Presentation

from backend.analytics_module.src import metadata_service, response_decoder
from backend.analytics_module.src.common.validation import DataAuditor
from backend.analytics_module.src.config.settings import SUPPORTED_ENCODINGS, COLUMN_NULL_THRESHOLD, BASE_PLACEHOLDER, ARABIC_DIGIT_MAP
from backend.analytics_module.src.MyPPTX.textboxes import replace_exact_text_all_slides
from backend.analytics_module.src.MySlides.run import run_dynamic_slides
from backend.analytics_module.src.ai import api_cost
from backend.analytics_module.src.calculation_engine import load_pivots
from backend.analytics_module.src.common.telemetry import TelemetryCollector
from backend.analytics_module.src.MySlides.pivot_store import PivotStore
from backend.analytics_module.src.MyPPTX.reporting_integrity import ReportingIntegrity
from backend.analytics_module.src.ai.model_router import ModelRouter



# (Local PivotStore definition removed in favor of centralized src.MySlides.pivot_store)

class SurveyAnalyzer:
    """
    Headless analytical engine that processes survey data and generates PPTX reports.
    Decoupled from file systems and Streamlit.
    """
    def __init__(self, project_inputs: dict, app_config):
        self.project_inputs = project_inputs
        self.app_config = app_config
        self.client = app_config.client
        self.model = app_config.model
        
        # Initialize Model Router
        self.router = ModelRouter(base_model=app_config.model)
        
        # Prepare output directory — use persistent volume for container survival
        ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        safe_name = project_inputs['project_name'].replace("/", "_").replace("\\", "_").replace(" ", "_")
        base_dir = os.environ.get("REPORTS_DIR", project_inputs.get('output_dir', '/app/reports'))
        self.out_dir = f"{base_dir}/{ts}-{safe_name}"
        os.makedirs(self.out_dir, exist_ok=True)
        
        self.telemetry = TelemetryCollector()
        
    def run(self, df_responses: pd.DataFrame, df_metrics: pd.DataFrame, meta_data: pd.DataFrame, meta_grids: pd.DataFrame, codebook_df: pd.DataFrame):
        """
        Executes the full analytical pipeline with built-in validation (Phase 4).
        """
        api_cost.reset()
        out_paths = []
        pivots_needed = self.project_inputs["pivots_needed"]
        
        with open(os.path.join(self.out_dir, "process_logs.txt"), "w", encoding="utf-8") as process_log:
            try:
                process_log.write(f"[INFO] Initializing Analysis: {self.project_inputs['project_name']}\n")
                
                # 1. Structural Audit (Phase 4: Integrity Layer)
                from backend.analytics_module.src.common.validation import DataAuditor, SampleManager
                audit_report = DataAuditor.audit_responses(df_responses, meta_data)
                
                # 1.1 Quality Scrub (Identify Speeders/Straight-liners)
                quality_audit = SampleManager.identify_outliers(df_responses, df_metrics)
                audit_report["quality_scrub"] = quality_audit
                
                outlier_ids = quality_audit.get("outlier_ids", [])
                if outlier_ids:
                    process_log.write(f"[WARN] Detected {len(outlier_ids)} outliers. Excluding from calculations.\n")
                    # Remove from metrics to ensure they don't pollute charts
                    df_metrics = df_metrics[~df_metrics['response_id'].isin(outlier_ids)]
                
                process_log.write(f"[AUDIT] Health Status: {audit_report['status']} | Coverage: {audit_report['coverage_percent']}%\n")
                if audit_report["missing_fields"]:
                    process_log.write(f"[WARN] Missing fields in data: {audit_report['missing_fields']}\n")

                # 2. Decoding (Phase 1 & 2: Platform-Native)
                process_log.write("[INFO] Decoding response layers via Platform-Native mappings\n")
                self.telemetry.start_event("data_decoding")
                df = response_decoder.run(df_responses, meta_data, codebook_df, meta_grids, self.project_inputs, self.client, self.model, self.out_dir)
                self.telemetry.end_event("data_decoding")
                
                data_store = PivotStore()
                import inspect
                process_log.write(f"[DEBUG] PivotStore source: {inspect.getfile(PivotStore)}\n")
                if not hasattr(data_store, "add"):
                    process_log.write(f"[ERROR] PivotStore is missing 'add'! Type: {type(data_store)} Dir: {dir(data_store)}\n")
                    # Emergency fix in-situ
                    def _emergency_add(k, v): data_store._dynamic_data[k] = v
                    data_store.add = _emergency_add
                    
                data_store.add("decoded_raw_data", df.copy())
                data_store.add("metrics_long_table", df_metrics) # NEW: Unified Long Table
                
                # Add screening pivot automatically if available
                screening_cols = self.project_inputs.get('screening_cols', [])
                if screening_cols:
                    data_store.add("screening_data", df[screening_cols])

                # 3. Calculation & Pivots (Phase 1: Renamed Engine)
                self.telemetry.start_event("pivot_generation")
                load_pivots(data_store, pivots_needed, self.project_inputs, self.out_dir, meta_data, codebook_df)
                self.telemetry.end_event("pivot_generation")

                # 4. PPTX Population
                process_log.write("[INFO] Generating Dynamic Slide Set\n")
                pres = Presentation(self.app_config.pptx_template_path)
                
                replace_exact_text_all_slides(
                    presentation=pres,
                    find_text=BASE_PLACEHOLDER,
                    replace_text=f"Base {len(df)}",
                )
                
                self.telemetry.start_event("slide_generation")
                slide_entries, raw_payloads, narrator_history, _ = run_dynamic_slides(
                    project_inputs=self.project_inputs,
                    data_store=data_store,
                    meta_data=meta_data,
                    meta_grids=meta_grids,
                    codebook_df=codebook_df,
                    pres=pres,
                    out_dir=self.out_dir,
                    client=self.client,
                    model=self.model,
                    w_insights=self.project_inputs.get("w_insights", False),
                    telemetry=self.telemetry,
                    router=self.router,
                )
                self.telemetry.end_event("slide_generation")
                
                # 5. Diagnostic Integrity Slide
                try:
                    ReportingIntegrity.append_diagnostic_slide(pres, audit_report)
                    process_log.write("[INFO] Appended Analytical Integrity Report slide\n")
                except Exception as di_e:
                    process_log.write(f"[WARN] Failed to append diagnostic slide: {str(di_e)}\n")

                # 6. Serialization & Storage
                charts_out_path = Path(f"{self.out_dir}/charts.pptx")
                pres.save(str(charts_out_path))
                
                return {
                    "report_path": str(charts_out_path),
                    "output_dir": self.out_dir,
                    "slide_entries": slide_entries,
                    "raw_payloads": raw_payloads,
                    "narrator_history": narrator_history,
                    "telemetry": self.telemetry.get_summary(),
                    "data_store": data_store
                }

            except Exception as e:
                process_log.write(f"[ERROR] Pipeline execution failed: {str(e)}\n")
                raise


def run_pipeline_new(project_inputs, app_config):
    """
    Backward compatibility wrapper for the legacy entry point.
    """
    # Legacy file loading logic
    dataset_path = project_inputs['dataset_path']
    if Path(dataset_path).suffix.lower() == '.csv':
        df = None
        for enc in SUPPORTED_ENCODINGS:
            try:
                df = pd.read_csv(dataset_path, sep=None, engine='python', encoding=enc)
                break
            except UnicodeDecodeError:
                continue
        if df is None:
            raise ValueError(f"Could not read CSV with encodings: {SUPPORTED_ENCODINGS}")
    else:
        df = pd.read_excel(dataset_path)

    meta_data, meta_grids, codebook_df = metadata_service.run(project_inputs['study_print_path'])
    
    analyzer = SurveyAnalyzer(project_inputs, app_config)
    return analyzer.run(df, meta_data, meta_grids, codebook_df)


if __name__ == "__main__":
    # from launchers import run_pipeline_cli
    # run_pipeline_cli()
    print("Standalone analysis engine entry point. Use launchers.py if available (missing).")


