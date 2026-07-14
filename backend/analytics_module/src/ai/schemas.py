"""
Structured Output Schemas — OpenAI `strict: true` mode.

Centralized JSON Schema definitions for all AI components that require
deterministic output structure. These schemas are compiled by OpenAI's
model at call-time, guaranteeing zero parse failures.

Usage:
    from backend.analytics_module.src.ai.schemas import get_response_format
    response_format = get_response_format("chart_insights")
"""
from __future__ import annotations

from typing import Any, Dict, Optional


# ---------------------------------------------------------------------------
# UNIFIED GLOBAL SCHEMA (Task 2.7 — Cache-Branch Reduction)
# ---------------------------------------------------------------------------
UNIFIED_AI_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "unified_ai_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "headline": {
                    "type": "string",
                    "description": "Crucial strategic summary (maps to headline, key_takeaway, or executive_summary)."
                },
                "insights": {
                    "type": "array",
                    "description": "Primary analytical points (maps to analysis_points, themes, or key_findings).",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
                            "recommended_action": {
                                "type": ["string", "null"],
                                "description": "One specific tactical action for the client team (chart insights)."
                            },
                            "percentage": {"type": ["integer", "null"]},
                            "quote": {"type": ["string", "null"]}
                        },
                        "required": ["title", "body", "sentiment", "recommended_action", "percentage", "quote"],
                        "additionalProperties": False
                    }
                },
                "meta": {
                    "type": "object",
                    "description": "Flexible container for component-specific extensions (SWOT, 4Ps, etc.).",
                    "properties": {
                        "swot": {
                            "type": ["object", "null"],
                            "properties": {
                                "strengths": {"type": "array", "items": {"type": "string"}},
                                "weaknesses": {"type": "array", "items": {"type": "string"}},
                                "opportunities": {"type": "array", "items": {"type": "string"}},
                                "threats": {"type": "array", "items": {"type": "string"}}
                            },
                            "required": ["strengths", "weaknesses", "opportunities", "threats"],
                            "additionalProperties": False
                        },
                        "four_ps": {
                            "type": ["object", "null"],
                            "properties": {
                                "product": {"type": "array", "items": {"type": "string"}},
                                "price": {"type": "array", "items": {"type": "string"}},
                                "place": {"type": "array", "items": {"type": "string"}},
                                "promotion": {"type": "array", "items": {"type": "string"}}
                            },
                            "required": ["product", "price", "place", "promotion"],
                            "additionalProperties": False
                        }
                    },
                    "required": ["swot", "four_ps"],
                    "additionalProperties": False
                }
            },
            "required": ["headline", "insights", "meta"],
            "additionalProperties": False
        }
    }
}


# ---------------------------------------------------------------------------
# OPPORTUNITY RESPONSE SCHEMA (Phase 5.3)
# ---------------------------------------------------------------------------
OPPORTUNITY_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "opportunity_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "opportunities": {
                    "type": "array",
                    "description": "Deterministic strategic opportunities (max 2).",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "Executive title (e.g. 'Weak Texture Consistency')."
                            },
                            "insight": {
                                "type": "string",
                                "description": "1-2 sentence data-linked explanation."
                            },
                            "strategic_category": {
                                "type": "string",
                                "enum": ["Product", "Marketing", "Quality", "Channel"],
                                "description": "Business silo primarily responsible for this action."
                            },
                            "impact": {
                                "type": "string",
                                "enum": ["High", "Medium", "Low"],
                                "description": "Magnitude of potential business improvement if addressed."
                            },
                            "effort": {
                                "type": "string",
                                "enum": ["High", "Medium", "Low"],
                                "description": "Complexity and resource cost for implementation."
                            },
                            "priority_level": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 5,
                                "description": "Rank-ordered priority (1 = Immediate Critical)."
                            },
                            "actions": {
                                "type": "array",
                                "description": "Exactly 3 structured tactical steps.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "action": {"type": "string"},
                                        "category": {"type": "string", "description": "Sub-category (e.g. Tactical, Strategic, Quick Win)."}
                                    },
                                    "required": ["action", "category"],
                                    "additionalProperties": False
                                },
                                "minItems": 3,
                                "maxItems": 3
                            }
                        },
                        "required": ["title", "insight", "strategic_category", "impact", "effort", "priority_level", "actions"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["opportunities"],
            "additionalProperties": False
        }
    }
}


# ---------------------------------------------------------------------------
# MARKET POSITION RESPONSE SCHEMA (Task 2.1)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# SMART FOLLOW-UP SCHEMA (Conversational AI)
# ---------------------------------------------------------------------------
SMART_FOLLOWUP_SCHEMA: Dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "smart_followup_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["probe", "complete"],
                    "description": "Whether to probe further or complete the follow-up loop."
                },
                "reasoning": {
                    "type": "string",
                    "description": "Internal analytical rationale."
                },
                "followup_text": {
                    "type": ["string", "null"],
                    "description": "A warm, non-leading probing question if action is probe."
                },
                "key_insights": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Extracted atomic findings from the response."
                }
            },
            "required": ["action", "reasoning", "followup_text", "key_insights"],
            "additionalProperties": False
        }
    }
}


# ---------------------------------------------------------------------------
# VERBATIM ANALYSIS SCHEMA (Bulk Open-End Analysis)
# ---------------------------------------------------------------------------
VERBATIM_ANALYSIS_SCHEMA: Dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "verbatim_analysis_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "themes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "count": {"type": "integer"}
                        },
                        "required": ["name", "count"],
                        "additionalProperties": False
                    }
                },
                "sentiment_breakdown": {
                    "type": "object",
                    "properties": {
                        "positive": {"type": "integer"},
                        "negative": {"type": "integer"},
                        "neutral": {"type": "integer"}
                    },
                    "required": ["positive", "negative", "neutral"],
                    "additionalProperties": False
                },
                "strategic_insights": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 3,
                    "maxItems": 3
                },
                "category_codes": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "example_excerpts": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["themes", "sentiment_breakdown", "strategic_insights", "category_codes", "example_excerpts"],
            "additionalProperties": False
        }
    }
}


# ---------------------------------------------------------------------------
# Market Position Response Schema ... (existing logic)
# ---------------------------------------------------------------------------
MARKET_POSITION_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "market_position_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "market_position": {
                    "type": "string",
                    "enum": ["Leader", "Challenger", "Niche", "Follower"],
                    "description": "Determined strategic position archetype based on multi-dimensional sigma analysis."
                },
                "position_confidence": {
                    "type": "string",
                    "enum": ["High", "Medium", "Low"],
                    "description": "AI's statistical confidence in the positioning verdict."
                },
                "target_audience_profile": {
                    "type": "string",
                    "description": "Executive summary of the primary demographic and geographic target profile."
                },
                "audience_segments": {
                    "type": "array",
                    "description": "Top 3 high-affinity audience segments with supporting rationale.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "segment_name": {"type": "string", "description": "e.g. 'Gen Z - Urban - High SES'"},
                            "rationale": {"type": "string", "description": "Description of why this segment over-indexes."},
                            "affinity_score": {"type": "number", "description": "The computed AAI score if available."}
                        },
                        "required": ["segment_name", "rationale", "affinity_score"],
                        "additionalProperties": False
                    },
                    "minItems": 3,
                    "maxItems": 3
                },
                "competitive_stance": {
                    "type": "string",
                    "description": "Strategic comparison against the primary identified competitor."
                },
                "strategic_implications": {
                    "type": "array",
                    "description": "Exactly 3 actionable positioning insights for brand leadership.",
                    "items": {"type": "string"},
                    "minItems": 3,
                    "maxItems": 3
                }
            },
            "required": [
                "market_position", "position_confidence", "target_audience_profile", 
                "audience_segments", "competitive_stance", "strategic_implications"
            ],
            "additionalProperties": False
        }
    }
}


# ---------------------------------------------------------------------------
# Schema Registry — Central lookup
# ---------------------------------------------------------------------------
_SCHEMA_REGISTRY: Dict[str, Dict[str, Any]] = {
    "chart_insights":      UNIFIED_AI_RESPONSE_SCHEMA,
    "verbatim_brand":      UNIFIED_AI_RESPONSE_SCHEMA,
    "executive_summary":   UNIFIED_AI_RESPONSE_SCHEMA,
    "unified":             UNIFIED_AI_RESPONSE_SCHEMA,
    "opportunity_summary": OPPORTUNITY_RESPONSE_SCHEMA,
    "market_position":     MARKET_POSITION_RESPONSE_SCHEMA,
    "smart_followup":      SMART_FOLLOWUP_SCHEMA,
    "verbatim_analysis":   VERBATIM_ANALYSIS_SCHEMA
}


def get_response_format(schema_key: str) -> Optional[Dict[str, Any]]:
    """
    Returns the OpenAI `response_format` dict for the given schema key.
    Falls back to basic json_object mode if key is not found (backward compat).
    """
    schema = _SCHEMA_REGISTRY.get(schema_key)
    if schema:
        return schema
    # Fallback for components not yet migrated to strict mode
    return {"type": "json_object"}
