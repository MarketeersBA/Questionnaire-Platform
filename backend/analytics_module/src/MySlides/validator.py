import logging
from typing import Dict, Any, List
from backend.analytics_module.src.MySlides.pivot_store import PivotStore

logger = logging.getLogger(__name__)

class DataValidator:
    """
    Phase 3: Global Validation.
    Executes structural checks across the PivotStore. Writes slide states
    and appends blocking reasons to the store. Never raises exceptions to stop execution.
    """

    def validate(self, store: PivotStore) -> None:
        try:
            # We initialize all slide blocks mapping dynamically as we find them.
            self._check_base_n(store)
            self._check_percentage_sums(store)
            self._check_funnel_monotonicity(store)
            self._check_required_fields(store)
            self._check_nps_range(store)
            self._set_final_slide_states(store)
        except Exception as e:
            logger.exception("DataValidator failed during global validation")
            
    def _block_slide(self, store: PivotStore, slide_n: int, reason: str):
        store.slide_states[slide_n] = "BLOCKED"
        if slide_n not in store.slide_blocking_reasons:
            store.slide_blocking_reasons[slide_n] = []
        store.slide_blocking_reasons[slide_n].append(reason)
        store.validation_log.append({
            "slide_number": slide_n,
            "event_type": "SLIDE_BLOCKED",
            "message": reason,
            "severity": "ERROR"
        })

    def _warn_slide(self, store: PivotStore, slide_n: int, reason: str):
        store.validation_log.append({
            "slide_number": slide_n,
            "event_type": "SLIDE_WARNING",
            "message": reason,
            "severity": "WARNING"
        })

    def _check_base_n(self, store: PivotStore) -> None:
        """3a. base_n thresholds"""
        for q_id, req in store.raw_answers.items():
            if not isinstance(req, dict):
                continue
            base_n = req.get("base_n")
            if base_n is not None:
                slide_n = req.get("mapped_slide") 
                if not slide_n:
                    continue
                try:
                    base_n_val = float(base_n)
                    if base_n_val < 10:
                        self._block_slide(store, slide_n, f"base_n={base_n_val} is below absolute minimum of 10.")
                    elif 10 <= base_n_val < 30:
                        self._warn_slide(store, slide_n, f"base_n={base_n_val} is below recommended minimum of 30. Results should be interpreted with caution.")
                except (ValueError, TypeError):
                    pass

    def _check_percentage_sums(self, store: PivotStore) -> None:
        """3b. Percentage summation check"""
        distribution_types = ["single_choice", "usage_frequency", "stocking_behavior", "purchase_intent", "nps_split"]
        for q_id, req in store.raw_answers.items():
            if not isinstance(req, dict):
                continue
            if req.get("question_type") in distribution_types:
                data_list = req.get("data", [])
                if not isinstance(data_list, list):
                    continue
                
                total = 0
                for item in data_list:
                    if isinstance(item, dict):
                        try:
                            total += float(item.get("value", 0))
                        except (ValueError, TypeError):
                            pass
                
                if total > 0 and abs(total - 1.0) > 0.01:
                    if abs(total - 1.0) > 0.10:
                        slide_n = req.get("mapped_slide", 0)
                        if slide_n:
                            self._block_slide(store, slide_n, f"Percentage array for {q_id} sum={total:.4f} exceeds 10% tolerance.")
                    else:
                        # Auto-normalize
                        for item in data_list:
                            if isinstance(item, dict):
                                try:
                                    item["value"] = float(item["value"]) / total
                                except (ValueError, TypeError, ZeroDivisionError):
                                    pass
                        self._warn_slide(store, req.get("mapped_slide", 0), f"Percentage array for question_id={q_id} normalized from sum={total:.4f} to 1.0.")

    def _check_funnel_monotonicity(self, store: PivotStore) -> None:
        """3c. Funnel monotonicity check"""
        for q_id, req in store.raw_answers.items():
            if not isinstance(req, dict):
                continue
            
            is_funnel = req.get("question_type") == "funnel_stages"
            has_py_key = any("past_year" in str(k) for k in req)
            
            if is_funnel or has_py_key:
                data_list = req.get("data", [])
                if not isinstance(data_list, list):
                    continue
                    
                for b_data in data_list:
                    if not isinstance(b_data, dict):
                        continue
                    b_id = b_data.get("brand_id")
                    if not b_id:
                        continue
                    
                    try:
                        # Awareness >= PY >= P3M >= MOU
                        ta = float(store.computed_metrics["total_awareness"].get(b_id, b_data.get("total_awareness", 0)) or 0)
                        py = float(b_data.get("past_year_pct", 0) or 0)
                        p3m = float(b_data.get("past_3months_pct", 0) or 0)
                        mou = float(b_data.get("mou_pct", 0) or 0)
                        
                        if not (ta >= py >= p3m >= mou):
                            violating_stages = []
                            if ta < py: violating_stages.append(f"TA={ta} < PY={py}")
                            if py < p3m: violating_stages.append(f"PY={py} < P3M={p3m}")
                            if p3m < mou: violating_stages.append(f"P3M={p3m} < MOU={mou}")
                            
                            b_name = b_data.get("brand_name", b_id)
                            for sl in [6, 7]:
                                self._block_slide(store, sl, f"Funnel non-monotonic for brand={b_name}: {', '.join(violating_stages)}.")
                    except (ValueError, TypeError, ZeroDivisionError):
                        pass

    def _check_required_fields(self, store: PivotStore) -> None:
        """3d. Required field presence check. Ensures core sections have their respective data."""
        from backend.analytics_module.src.MyPPTX.slides import SLIDE_REGISTRY

        sections_lower = [s.lower() for s in store.selected_sections]
        
        # 1. BAPF Requirements
        if any("awareness" in s or "funnel" in s for s in sections_lower):
            bapf_pivot = store.get("BAPF_pivot")
            if bapf_pivot is None or bapf_pivot.empty:
                for sn, cfg in SLIDE_REGISTRY.items():
                    if "brand awareness" in cfg.get("section_id", "").lower():
                        self._block_slide(store, int(sn), "Brand Awareness data (BAPF_pivot) is missing.")

        # 2. Taste Test Requirements
        if "taste test" in sections_lower:
            pivot_scalers = store.get("pivot_scalers")
            if pivot_scalers is None or pivot_scalers.empty:
                for sn, cfg in SLIDE_REGISTRY.items():
                    if "taste test" in cfg.get("section_id", "").lower():
                        if cfg.get("slide_type") != "divider":
                            self._block_slide(store, int(sn), "Sensory data (pivot_scalers) is missing or empty.")

    def _check_nps_range(self, store: PivotStore) -> None:
        """3e. NPS range check"""
        for b_id, score in store.computed_metrics["nps_scores"].items():
            if score is None or not (-100 <= score <= 100):
                self._block_slide(store, 38, f"Invalid NPS score {score} for brand {b_id}")

    def _set_final_slide_states(self, store: PivotStore) -> None:
        """3f. Set final slide states using the SLIDE_REGISTRY definitions."""
        from backend.analytics_module.src.MyPPTX.slides import SLIDE_REGISTRY
        
        for slide_n_str, config in SLIDE_REGISTRY.items():
            try:
                slide_n = int(slide_n_str)
            except ValueError:
                continue
                
            current_state = store.slide_states.get(slide_n)
            
            # If it's already blocked, keep it blocked.
            if current_state == "BLOCKED":
                continue
                
            # Cover and Thank you are always READY
            if slide_n in (1, 65):
                store.slide_states[slide_n] = "READY"
                continue
                
            sec_id = config.get("section_id")
            normalized_sections = [str(s).strip().lower().replace(" ", "_").replace("-", "_") for s in store.selected_sections]
            
            if sec_id:
                normalized_sec_id = sec_id.strip().lower().replace(" ", "_").replace("-", "_")
                
                if normalized_sec_id not in normalized_sections:
                    store.slide_states[slide_n] = "SKIPPED"
                else:
                    s_type = config.get("slide_type")
                    if s_type == "divider":
                        store.slide_states[slide_n] = "DIVIDER"
                    else:
                        store.slide_states[slide_n] = "READY"
