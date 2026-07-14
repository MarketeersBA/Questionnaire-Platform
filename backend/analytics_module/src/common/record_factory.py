import pandas as pd
from typing import List, Dict, Any, Tuple

class RecordFactory:
    """
    Unified Ingestion Engine.
    Transforms fragmented response structures into a standardized 'Long Table' 
    of (response_id, metric, brand, value).
    """

    @staticmethod
    def explode_responses(responses: List[Dict[str, Any]], meta_data: pd.DataFrame, brands: List[str] = None) -> pd.DataFrame:
        """
        Main entry point. Iterates over all responses and produces a flat metrics DataFrame.
        """
        all_records = []
        brands = brands or []
        
        # Build mapping of question_id to canonical metric names from metadata
        q_map = meta_data.set_index("question_name")["header"].to_dict()
        
        for resp in responses:
            resp_id = str(resp.get("_id") or resp.get("token"))
            token = resp.get("token")
            answers = resp.get("answers", {})
            
            # 1. Process standard fields (Top-level metrics)
            for k, v in answers.items():
                if k.startswith("_") or k in ["evaluations", "__structured", "purchase_funnel"]:
                    continue
                
                # 1. Check for brand-encoded keys (e.g. Bite1, Bite_Hero, Hero_custom_sub_Bite_hash)
                metric_brand = "Global"
                metric_name = k
                
                # First, resolve the key through the question map (ID -> Human Name)
                # This handles cases where 'answers' uses IDs as keys.
                resolved_name = q_map.get(k, k)
                
                # Check for brand patterns in either the raw key OR the resolved name
                for b in brands:
                    pattern_brand = str(b)
                    # Pattern 1: {Brand}_custom_sub_{Attribute}_{Hash}
                    if "custom_sub_" in resolved_name and pattern_brand in resolved_name:
                        metric_brand = pattern_brand
                        # Extract the part between custom_sub_ and the last hash
                        parts = resolved_name.split("custom_sub_")
                        if len(parts) > 1:
                            metric_name = parts[1].rsplit("_", 1)[0]
                        break
                    
                    # Pattern 2: {Attribute}_{Brand} or {Brand}_{Attribute}
                    if resolved_name.endswith(f"_{pattern_brand}"):
                        metric_brand = pattern_brand
                        metric_name = resolved_name.rsplit("_", 1)[0]
                        break
                    elif resolved_name.startswith(f"{pattern_brand}_"):
                        metric_brand = pattern_brand
                        metric_name = resolved_name.split("_", 1)[1]
                        break
                
                # Numeric suffix check (e.g. Bite1)
                import re
                num_match = re.search(r'(\d+)$', metric_name)
                if metric_brand == "Global" and num_match and brands:
                    brand_idx = int(num_match.group(1)) - 1
                    if 0 <= brand_idx < len(brands):
                        metric_brand = brands[brand_idx]
                        metric_name = re.sub(r'\s*\d+$', '', metric_name)

                # Final canonical mapping (in case the attribute name needs normalization)
                metric_name = q_map.get(metric_name, metric_name)


                # Check if it's a list (Multiple Choice)
                if isinstance(v, list):
                    for item in v:
                        all_records.append({
                            "response_id": resp_id,
                            "token": token,
                            "metric": metric_name,
                            "brand": item if metric_brand == "Global" else metric_brand,
                            "value": 1,
                            "type": "standard_mc"
                        })
                else:
                    all_records.append({
                        "response_id": resp_id,
                        "token": token,
                        "metric": metric_name,
                        "brand": metric_brand,
                        "value": v,
                        "type": "standard_sc"
                    })
            
            # 2. Process Evaluations (Legacy and Modern)
            evals = answers.get("_evaluations") or answers.get("evaluations")
            
                # Legacy Nested Evaluations
            if isinstance(evals, dict):
                for group, brands_data in evals.items():
                    if isinstance(brands_data, dict):
                        for brand, attrs in brands_data.items():
                            if isinstance(attrs, dict):
                                for attr, val in attrs.items():
                                    # Map attribute ID to human name if possible
                                    resolved_attr = q_map.get(attr, attr)
                                    all_records.append({
                                        "response_id": resp_id,
                                        "token": token,
                                        "metric": resolved_attr,
                                        "brand": brand,
                                        "value": val,
                                        "type": "evaluation_legacy"
                                    })
            
            # Modern List-based Evaluations
            elif isinstance(evals, list):
                for item in evals:
                    if isinstance(item, dict):
                        raw_attr = item.get("attribute") or item.get("metric")
                        resolved_attr = q_map.get(raw_attr, raw_attr)
                        all_records.append({
                            "response_id": resp_id,
                            "token": token,
                            "metric": resolved_attr,
                            "brand": item.get("brand"),
                            "value": item.get("value"),
                            "type": "evaluation_list"
                        })
            
            # 3. Process Structured Evaluations (Modern Gateway)
            structured = answers.get("__structured", {})
            if isinstance(structured, dict):
                evals_struct = structured.get("_evaluations") or structured.get("evaluations")
                if isinstance(evals_struct, dict):
                    q_info_map = structured.get("question_map", {})
                    for group, brands_data in evals_struct.items():
                        if isinstance(brands_data, dict):
                            for brand, questions in brands_data.items():
                                for q_id, val in questions.items():
                                    # Fallback to q_map if attribute not in structured map
                                    attr = q_info_map.get(q_id, {}).get("attribute") or q_map.get(q_id, q_id)
                                    all_records.append({
                                        "response_id": resp_id,
                                        "token": token,
                                        "metric": attr,
                                        "brand": brand,
                                        "value": val,
                                        "type": "evaluation_structured"
                                    })
            
            # 4. Process Purchase Funnel
            pf = answers.get("purchase_funnel") or structured.get("purchase_funnel")
            if isinstance(pf, dict):
                for pf_key, brands_dict in pf.items():
                    if isinstance(brands_dict, dict):
                        for brand, val in brands_dict.items():
                            all_records.append({
                                "response_id": resp_id,
                                "token": token,
                                "metric": pf_key,
                                "brand": brand,
                                "value": val,
                                "type": "purchase_funnel"
                            })

        return pd.DataFrame(all_records)
