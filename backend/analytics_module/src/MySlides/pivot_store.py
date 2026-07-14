from dataclasses import dataclass, field
from typing import Dict, Any, List

@dataclass
class PivotStore:
    """
    The single source of truth object passed across all 6 phases of the 
    Market Research Report Agent pipeline. No phase writes to any other 
    shared location.
    """
    
    # Project metadata (client name, date, study type, language, currency, geography, fieldwork dates, total sample size)
    project: Dict[str, Any] = field(default_factory=dict)
    
    # List of brand objects (brand_id, brand_name, is_client_brand, color_hex, logo_url)
    brands: List[Dict[str, Any]] = field(default_factory=list)
    
    # Parsed answer objects keyed by question_id
    # Format: { question_text, question_type, brand_specific flag, brand_id, segment_filter, base_n, data array }
    raw_answers: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    
    # Derived values keyed by metric name (e.g., total_awareness, funnel_ratios, top_2_box, nps_scores)
    computed_metrics: Dict[str, Any] = field(default_factory=lambda: {
        "total_awareness": {},
        "funnel_ratios": {},
        "funnel_ratio_averages": {},
        "top_2_box": {},
        "nps_scores": {},
        "bpi_scores": {},
        "importance_scores": {},
        "scatter_quadrants": {},
        "areas_to_maintain": [],
        "areas_to_improve": [],
        "importance_scores_available": True
    })
    
    # Slide state flags mapping slide_number (1-65) to READY | BLOCKED | SKIPPED | DIVIDER
    # SKIPPED = not in selected sections. DIVIDER = static section title slide.
    slide_states: Dict[int, str] = field(default_factory=dict)
    
    # Keyed by slide_number, value is list of strings explaining why it is blocked
    slide_blocking_reasons: Dict[int, List[str]] = field(default_factory=dict)
    
    # Validation event objects: { slide_number, event_type, message, severity: INFO | WARNING | ERROR }
    validation_log: List[Dict[str, Any]] = field(default_factory=list)
    
    # List of section IDs requested by the user
    selected_sections: List[str] = field(default_factory=list)

    def add(self, key: str, value: Any):
        """Store dynamic state (e.g. current filters) for calculations."""
        setattr(self, key, value)

    def get(self, key: str, default: Any = None) -> Any:
        """Retrieve state from attributes or return default."""
        return getattr(self, key, default)

    def update(self, data: Dict[str, Any]):
        """Bulk update attributes from a dictionary."""
        for k, v in data.items():
            self.add(k, v)

