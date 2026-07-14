# 🧠 AI Architecture — Survey Report Pipeline

> **Version:** 2.0 · **Last Updated:** April 2026  
> **Scope:** Complete technical reference for every AI integration point in the report generation pipeline.

---

## Table of Contents

1. [High-Level Pipeline Flow](#1-high-level-pipeline-flow)
2. [AI Component Registry](#2-ai-component-registry)
3. [Prompt Management System](#3-prompt-management-system)
4. [Component Deep Dives](#4-component-deep-dives)
   - 4.1 [Slide-Level Insights (PPTX)](#41-slide-level-insights-pptx-narrator)
   - 4.2 [Chart Insight Engine (Web)](#42-chart-insight-engine-web-dual-output)
   - 4.3 [Verbatim Analyzer (Brand-Scoped)](#43-verbatim-analyzer-brand-scoped)
   - 4.4 [Open-End Coding (ai_percentages)](#44-open-end-coding-ai_percentages)
   - 4.5 [Unaided Brand Mapping (Decoder)](#45-unaided-brand-mapping-decoder)
   - 4.6 [Insight Aggregation (Executive Synthesis)](#46-insight-aggregation-executive-synthesis)
   - 4.7 [Executive Hero Summary (PPTX)](#47-executive-hero-summary-pptx)
   - 4.8 [4P Recommendations](#48-4p-strategic-recommendations)
5. [AI Persona System](#5-ai-persona-system)
6. [Caching & Performance Layer](#6-caching--performance-layer)
7. [Cost Tracking & Telemetry](#7-cost-tracking--telemetry)
8. [Resilience & Fault Tolerance](#8-resilience--fault-tolerance)
9. [File Reference Map](#9-file-reference-map)

---

## 1. High-Level Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        REPORT GENERATION PIPELINE                               │
│                                                                                 │
│  ┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌────────────────────┐   │
│  │ Ingestor │───>│ Decoder   │───>│ Aggregator   │───>│ Report Orchestrator│   │
│  │ (CSV/DB) │    │ (AI: §4.5)│    │ (Charts/Data)│    │ (AI: §4.1-§4.8)   │   │
│  └──────────┘    └───────────┘    └──────────────┘    └────────┬───────────┘   │
│                                                                │               │
│                                        ┌───────────────────────┼──────────┐    │
│                                        │                       │          │    │
│                                        ▼                       ▼          ▼    │
│                              ┌──────────────┐  ┌────────────────┐  ┌────────┐ │
│                              │  Web Report   │  │  Insight       │  │ PPTX   │ │
│                              │  (JSON→DB)    │  │  Aggregator    │  │ Export │ │
│                              │  AI: §4.2,4.3 │  │  AI: §4.6,4.8 │  │ AI:4.7 │ │
│                              └──────────────┘  └────────────────┘  └────────┘ │
│                                                                                │
│   ─ ─ ─ ─ ─ ─ ─ ─ CROSS-CUTTING CONCERNS  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│   │ Prompt Registry (§3) │ Cost Tracker (§7) │ Cache (§6) │ AIGuard (§8) │    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Execution Sequence (per Report Generation)

| Step | Phase | AI Component | Section Ref |
|:-----|:------|:-------------|:------------|
| 1 | **Decode** | Unaided Brand Mapping | §4.5 |
| 2 | **Compute** | Open-End Coding (ai_percentages) | §4.4 |
| 3 | **Narrate** | Slide-Level Insights (PPTX) | §4.1 |
| 4 | **Serialize** | Chart Insight Engine (per chart) | §4.2 |
| 5 | **Analyze** | Verbatim Analyzer (brand-scoped) | §4.3 |
| 6 | **Synthesize** | Executive Summary / SWOT / 4Ps | §4.6 |
| 7 | **Finalize** | Executive Hero Summary (PPTX) | §4.7 |

---

## 2. AI Component Registry

| Component ID | Purpose | Model | Async | Cached | Cost Tracked |
|:------------|:---------|:------|:------|:-------|:-------------|
| `insights` | Slide-level narration for PPTX | Configurable | ❌ Sync | ❌ | ✅ |
| `chart_insights` | Per-chart headline + deep analysis | Configurable | ✅ Async | ✅ MongoDB | ✅ |
| `verbatim` | Brand-scoped thematic analysis | Configurable | ✅ Async | ✅ MongoDB | ✅ |
| `verbatim_synthesis` | Cross-brand comparison headline | Configurable | ✅ Async | ❌ | ✅ |
| `ai_percentages` | Open-end response classification | `gpt-4o-mini` | ❌ Sync | ❌ | ✅ |
| `decoder` | Unaided brand variant mapping | `gpt-4o-mini` | ❌ Sync | ❌ File | ✅ |
| `executive_summary` | Report-level synthesis (JSON) | Configurable | ❌ Sync | ❌ | ✅ |
| `executive_hero` | Top-3 takeaway hero summary | Configurable | ❌ Sync | ❌ | ✅ |
| `recommendations` | 4P strategic advice | Configurable | ❌ Sync | ❌ | ✅ |

---

## 3. Prompt Management System

### Architecture

All prompts are managed by a centralized **PromptRegistry** that loads versioned JSON templates from disk at startup.

```
backend/resources/analytics/prompts/
├── chart_insights.json       ← v1.1.0
├── executive_summary.json    ← v1.0.0
├── recommendations.json      ← v1.1.0
├── slide_insights.json       ← v1.1.0
└── verbatim_analysis.json    ← v1.2.0
```

**Source File:** `backend/analytics_module/src/ai/prompt_registry.py`

### JSON Template Schema

Every prompt template file follows this structure:

```json
{
    "version": "1.1.0",
    "persona": "Strategic Data Scientist",
    "system": "System prompt text (role definition)",
    "user_base": "Main user prompt with {variables}",
    "brand_focus_addendum": "Optional brand-specific text",
    "validation": {
        "required_vars": ["var1", "var2"]
    }
}
```

### Safe Formatting

Templates are formatted using `PromptRegistry._safe_format()` — a custom formatter that replaces `{variable}` placeholders without erroring on literal JSON braces `{{ }}` in the template. This prevents `KeyError` crashes when templates contain JSON schema examples.

```python
# Standard .format() would crash on: "Output: {\"key\": \"value\"}"
# _safe_format only replaces known variable placeholders via str.replace()
```

### Prompt Retrieval Flow

```
Code calls registry.format_prompt("chart_insights", {vars})
  └─> PromptRegistry.get_template("chart_insights")
       └─> Looks up self.registry["chart_insights"] (loaded from JSON)
       └─> Falls back to _FALLBACKS dict if file missing
  └─> PromptRegistry._safe_format(user_base, variables)
       └─> Returns fully-formatted prompt string
```

---

## 4. Component Deep Dives

---

### 4.1 Slide-Level Insights (PPTX Narrator)

**Purpose:** Generates a 1-2 sentence narration for each analytical slide in the PPTX export.

**Source File:** `backend/analytics_module/src/ai/__init__.py` → `generate_insight()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `slide_data` | Raw payload from `SurveyAnalyzer` | Dict of DataFrames or single DataFrame |
| `slide_id` | Slide registry | Unique identifier (e.g., `preference_overall`) |
| `section` | Slide config | Section name (e.g., "Brand Awareness") |
| `my_brand` | `project_inputs.own_brand` | Client's brand for strategic focus |
| `previous_context` | Narrator history accumulator | Context from previous slides for coherence |

#### Data Processing
1. `_data_to_summary(slide_data)` converts DataFrames into a truncated text representation (max 3000 chars)
   - For dict payloads: iterates key-value pairs, converts DataFrame values to `.head(8).to_string()`
   - Allocates `MAX_DATA_SUMMARY_CHARS // n` characters per item for fair distribution
2. Brand detection via `_my_brand_in_data()` — checks if client brand appears in indices/columns
3. Persona modulation via `PersonaManager` (see §5)

#### Prompt Template: `slide_insights.json`

**System Prompt:**
```
"You are a concise analyst and a business consultant. Reply with only 1-2 short
sentences suitable for a presentation slide insight. No preamble."
```

**User Prompt (formatted):**
```
Slide: {slide_id}

Data summary (may include multiple charts — consider all):
{summary}

Provide one short decisive insight for this slide that considers all data above.
```

**Brand Addendums (conditional):**
- If client brand is IN the data: `"Focus your insight on actionable advice for {brand_name}"`
- If client brand is NOT in the data: `"Frame insight as competitive context for {brand_name}"`

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| `max_tokens` | 150 |
| `response_format` | Not specified (plain text) |
| `temperature` | Default (1.0) |

#### Output Format
- **Type:** Plain string (1-2 sentences)
- **Destination:** Written to PPTX slide text box + stored in `narrator_history[]`
- **Cost Component:** `insights`

---

### 4.2 Chart Insight Engine (Web Dual-Output)

**Purpose:** Generates structured JSON per chart: headline + multi-point deep analysis.

**Source File:** `backend/analytics_module/chart_insight_engine.py` → `ChartInsightEngine.generate()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `chart: ChartPayload` | WebReportSerializer | Contains `chart_id`, `chart_type`, `title`, `data`, `brands`, `base_n` |
| `section_name` | Report section | Grouping context (e.g., "Product Preference") |
| `my_brand` | Constructor | Client's brand name |
| `research_type` | Constructor | "TasteTest", "BA/PF", etc. |
| `archetype` | Constructor | Brand archetype (e.g., "Challenger") |

#### Data Processing
1. `_data_to_summary(chart.data)` converts chart data dict to text
2. Brand detection: checks `chart.brands` list and summary text
3. Cache-first strategy: checks MongoDB `ai_insight_cache` before calling API

#### Prompt Template: `chart_insights.json`

**System Prompt:**
```
"You are an elite Business Strategy Consultant and Senior Data Scientist
specialized in Market Research. Your mission is to decode complex survey
datasets into high-fidelity, actionable executive insights.

CORE PRINCIPLES:
1. BEYOND THE OBVIOUS: Do not simply restate numbers. Explain implications.
2. STRATEGIC CONTEXT: Consider section category and research type.
3. COMPETITIVE EDGE: Identify strengths to leverage and weaknesses as risks.
4. TERMINOLOGY: Use 'Over-indexing', 'Market Parity', 'Friction Points', etc.
5. SENTIMENT PRECISION: Label business impact accurately."
```

**User Prompt (formatted):**
```
RESEARCH CONTEXT:
- Survey Type: {research_type}
- Section: {section}
- Archetype: {archetype}

CHART SPECIFICATIONS:
- Title: {chart_title}
- Visualization: {chart_type}
- Brands Analyzed: {brands}
- Sample Size (n): {base_n}

DATA SUMMARY (RAW METRICS):
{data_summary}

REQUIRED TASKS:
1. HEADLINE INSIGHT: Synthesize a powerful 1-2 sentence business headline.
2. DEEP ANALYSIS: Provide exactly 3-4 detailed analysis objects.

JSON SCHEMA RESPONSE:
{
  "headline": "string",
  "analysis_points": [
    { "title": "string", "body": "string", "sentiment": "positive|negative|neutral" }
  ]
}
```

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| `max_tokens` | 1200 |
| `response_format` | `{"type": "json_object"}` |
| `temperature` | 0.2 |

#### Output Schema
```json
{
  "headline": "Abu Auf's 42% preference share signals a decisive quality advantage that competitors cannot close with price alone.",
  "analysis_points": [
    {
      "title": "The Quality Gap",
      "body": "With a 15pp preference gap over the nearest competitor, Abu Auf has built a moat around sensory quality...",
      "sentiment": "positive"
    },
    {
      "title": "Price Sensitivity Threshold",
      "body": "Despite premium pricing, the conversion rate of 78% indicates the quality-price ratio is still favorable...",
      "sentiment": "neutral"
    }
  ]
}
```

- **Destination:** `ChartPayload.ai_headline` + `ChartPayload.ai_deep_analysis` → MongoDB `survey_reports.sections.charts`
- **Caching:** Saved to `ai_insight_cache` collection with prompt hash for invalidation
- **Cost Component:** `chart_insights`

---

### 4.3 Verbatim Analyzer (Brand-Scoped)

**Purpose:** Performs per-brand thematic analysis on open-ended survey responses (Likes, Dislikes, Improvements, Favorites), then synthesizes a cross-brand comparison headline.

**Source File:** `backend/analytics_module/src/ai/verbatim_analyzer.py` → `VerbatimAnalyzer`

#### Two-Phase Pipeline

**Phase 1: Brand-Scoped Analysis** (`analyze_responses_async`)
- Runs in parallel using `asyncio.gather()` across all brands
- Capped at 100 responses per brand (random sample with seed=42)

**Phase 2: Cross-Brand Synthesis** (`_synthesize_cross_brand`)
- Takes the `key_takeaway` from each brand and generates a single comparative headline

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `df_responses` | Decoded survey data | Full response DataFrame |
| `project_inputs` | Pipeline config | Contains `suffix_map`, `comparators_map`, column keys |
| `brands` | `project_inputs.brands` | List of brand names (e.g., `["Abu Auf", "Nestle"]`) |

#### Column Resolution Logic
For each brand, the system resolves the exact column using a suffix system:
```
Question Key: "like_in_taste"
Brand: "Abu Auf" → suffix "1" → Column: "like_in_taste1"
Brand: "Nestle"  → suffix "2" → Column: "like_in_taste2"
```

Resolution priority:
1. `project_inputs.suffix_map` (explicit mappings)
2. `project_inputs.comparators_map` (comparator pairs)
3. Positional index in `brands` list (fallback)

#### Prompt Template: `verbatim_analysis.json`

**System Prompt:**
```
"You are a qualitative research expert specializing in competitive product
intelligence. Your goal is to identify meaningful themes, sentiment, and
unique brand differentiators from open-ended consumer feedback."
```

**User Prompt — Brand-Scoped (`user_base_brand_scoped`):**
```
BRAND IDENTITY: {brand_name}
QUESTION CONTEXT: {question_type}
TOTAL SAMPLE SIZE: {total_responses}

DE-IDENTIFIED CONSUMER FEEDBACK:
{responses_summary}

ANALYTICAL REQUIREMENTS:
1. BRAND SENTIMENT: How do participants feel about {brand_name}?
2. COMPETITIVE THEMES: Identify prevalent themes unique to this brand.
3. KEY TAKEAWAY: A punchy, executive-level summary.

JSON OUTPUT FORMAT:
{
  "sentiment": { "positive": 0, "negative": 0, "neutral": 0 },
  "themes": [
    { "title": "string", "description": "string", "percentage": 0, "quote": "string" }
  ],
  "key_takeaway": "string"
}
```

**Cross-Brand Synthesis Prompt:**
```
Vertical Comparison: {question_type}
Number of Brands Analyzed: {num_brands}

INDIVIDUAL BRAND ANALYSES:
{brand_analyses_json}

TASK: Provide a single, one-sentence punchy headline comparing findings.
```

#### API Call Parameters

| Parameter | Phase 1 | Phase 2 |
|:----------|:--------|:--------|
| `max_tokens` | 1000 | 500 |
| `response_format` | `json_object` | Plain text |
| `temperature` | Default | Default |

#### Output Schema (Phase 1)
```json
{
  "sentiment": { "positive": 65, "negative": 20, "neutral": 15 },
  "themes": [
    {
      "title": "Premium Taste Profile",
      "description": "Consumers highlight the rich, distinctive flavor as a primary purchase driver.",
      "percentage": 45,
      "quote": "The taste is unmatched — nothing else compares."
    }
  ],
  "key_takeaway": "Abu Auf dominates sensory satisfaction with a 65% positive sentiment."
}
```

#### Output Destination
- **Per-Brand Analysis:** Serialized via `WebReportSerializer._serialize_verbatim_analysis()` into `ChartPayload` objects
- **Cross-Brand Synthesis:** Stored alongside the brand analyses
- **Cost Components:** `verbatim_{component_key}` + `verbatim_synthesis`

---

### 4.4 Open-End Coding (ai_percentages)

**Purpose:** Classifies free-text survey answers into thematic categories with percentage distributions using LLM analysis.

**Source File:** `backend/analytics_module/src/Calculations/percentages.py` → `ai_percentages()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `df[column]` | Decoded survey data | Single column of open-text responses |
| `purpose` | Visual config | "like" / "dislike" / "improve" — controls classification direction |
| `model` | Pipeline config | Default: `gpt-4o-mini` |

#### Purpose-Driven Instructions
The system adapts its classification rules based on the open-end type:

| Purpose | Directive |
|:--------|:----------|
| `improve` | Categories must be **directional and actionable** (e.g., "Increase sweetness") |
| `dislike` | Categories must reflect **negative feedback** (e.g., "Too sweet", "Price too high") |
| `like` | Categories must be **positive** (e.g., "Good taste", "Affordable price") |
| Default | Neutral classification with no directional assumptions |

#### Prompt (Inline)
```
You are a senior market research analyst. Your job is to classify open-ended
survey answers into clear, meaningful categories.

{purpose_instructions}

General Rules:
- Categories are in English
- Maximum 10 categories.
- Each category must be precise and non-contradictory.
- Provide: category (string), percentage (float), 2–4 example answers
- Percentages must sum to 100.
- Output VALID JSON ONLY in this exact structure:
[
  {
    "category": "string",
    "Percentage": float,
    "examples": ["...", "..."]
  }
]

Here are the answers:
{answers_as_json}
```

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| `max_tokens` | 1500 |
| `response_format` | `json_object` (if model supports) |
| `temperature` | Default |
| Retry: Connection | Up to `LLM_MAX_CONNECTION_RETRIES` with exponential backoff |
| Retry: JSON parse | Up to `LLM_MAX_JSON_RETRIES` |

#### Output Schema
```json
[
  { "category": "Rich Flavor", "Percentage": 35.0, "examples": ["Great taste", "Love the flavor"] },
  { "category": "Affordable Price", "Percentage": 25.0, "examples": ["Good value", "Worth the money"] }
]
```

- **Destination:** Used to build `wordcloud` or `table` chart payloads
- **Prompt File Saved:** `<output_dir>/open_end_prompts/{slug}_{visual_id}.txt`
- **Cost Component:** `ai_percentages`

---

### 4.5 Unaided Brand Mapping (Decoder)

**Purpose:** Maps messy, free-form brand name responses to canonical brand names using LLM pattern matching.

**Source File:** `backend/analytics_module/src/response_decoder/unaided.py` → `ai_brand_map()`, `map_brand_names()`

**Integration File:** `backend/analytics_module/src/response_decoder/__init__.py` → `run()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `df` | Raw survey data | DataFrame with unaided awareness columns |
| `brands` | Codebook | Canonical brand name list from `codebook_df` |
| `columns` | `names` config | Target columns: `[unaided_col, tom_col]` |

#### Processing Pipeline
1. **Extract** all unique text values from unaided columns
2. **Deduplicate** (case-insensitive) to reduce variants
3. **Chunk** into groups of 600 variants
4. **Send** each chunk to LLM for classification
5. **Merge** chunk results into final map
6. **Save** to `<output_dir>/map.json`

#### Prompt (Inline, Configurable)
```
Your task is to normalize these brand-name variants into canonical categories.
Map each variant to the canonical brand it most likely refers to.

Canonical brands: {brands}
Variants to map: {variants}

Output valid JSON: { "BrandName": ["variant1", "variant2", ...] }
```

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| Model | `gpt-4o-mini` (default) |
| `max_tokens` | 2048 |
| `temperature` | 0.0 (deterministic) |
| `response_format` | `json_object` |

#### Output Schema
```json
{
  "Abu Auf": ["abu auf", "abo auf", "abu of", "abo of"],
  "Nestle": ["nestle", "nestlé", "nestel", "nstl"]
}
```

#### Cost Tracking Integration
The decoder module has its own `Usage` dataclass. After mapping, the integration file calls:
```python
api_cost.add_from_usage_summary("decoder", usage_summary)
```

- **Destination:** `map.json` file + fed back into `decode_unaided_values()` for DataFrame transformation
- **Cost Component:** `decoder`

---

### 4.6 Insight Aggregation (Executive Synthesis)

**Purpose:** Consumes ALL slide-level narrations and generates a cohesive executive report: Executive Summary, Key Findings, Brand SWOT, and 4P Recommendations.

**Source File:** `backend/analytics_module/insight_aggregator.py` → `InsightAggregator.aggregate()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `narrator_history` | Accumulated from §4.1 | List of `{"slide_id", "section", "narration"}` dicts |
| `brand_list` | `project_inputs.brands` | All brands being analyzed |

#### Pre-Processing
- Filters out empty insights and `AIGuard.FALLBACK_MSG` entries
- Concatenates valid narrations into a single `narration_context` string:
  ```
  SLIDE preference_overall (Product Preference): Abu Auf leads with 42%...
  SLIDE awareness_funnel (Brand Awareness): Category awareness is at 78%...
  ```

#### Prompt (Inline)
```
You are a Senior Consumer Insight Analyst. You have just completed
a complex study for {brand_list}.

Below is the collection of insights generated for each individual slide.

YOUR TASK: Synthesize this into a cohesive final report structure in JSON.

HISTORY OF SLIDE INSIGHTS:
{narration_context}

REQUIRED JSON STRUCTURE:
{
    "executive_summary": "3-4 sentences high level overview",
    "key_findings": [
        { "label": "Short title", "finding": "Full detail", "impact": "positive|negative|neutral" }
    ],
    "brand_swot": {
        "Brand Name": {
            "strengths": [], "weaknesses": [], "opportunities": [], "threats": []
        }
    },
    "recommendations_4p": {
        "product": "advice string",
        "price": "advice string",
        "place": "advice string",
        "promotion": "advice string"
    }
}
```

**System Prompt:**
```
"You are a professional research report synthesizer. Only output valid JSON."
```

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| `max_tokens` | 1500 |
| `response_format` | `{"type": "json_object"}` |
| `temperature` | Default |
| Retry | 3 attempts with exponential backoff (2s, 4s, 8s) |

#### Output Schema → `ReportInsights` Model
```json
{
  "executive_summary": "Abu Auf demonstrates clear market leadership...",
  "key_findings": [
    { "label": "Taste Dominance", "finding": "42% preference share...", "impact": "positive" }
  ],
  "brand_swot": {
    "Abu Auf": {
      "strengths": ["Superior taste profile"],
      "weaknesses": ["Premium pricing barrier"],
      "opportunities": ["Untapped rural markets"],
      "threats": ["Private label competition"]
    }
  },
  "recommendations_4p": {
    "product": "Introduce a value-tier SKU...",
    "price": "Implement strategic bundling...",
    "place": "Expand hypermarket distribution...",
    "promotion": "Launch taste comparison campaign..."
  }
}
```

- **Destination:** `SurveyReport.insights` in MongoDB
- **Cost Component:** `executive_summary`

---

### 4.7 Executive Hero Summary (PPTX)

**Purpose:** generates a concise "Top-3 Takeaways" summary for the Executive Summary slide in the PPTX output.

**Source File:** `backend/analytics_module/src/ai/executive.py` → `ExecutiveSynthesizer.generate_hero_summary()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `insights` | Narrator history | List of `{"title", "insight"}` dicts from all slides |

#### Prompt (Inline)
```
Review the following insights from a market research report.
Synthesize the 3 MOST CRITICAL results into a high-level executive summary.
Be extremely direct and strategic.

REPORT DATA:
[Slide: Product Preference] Abu Auf leads with 42%...
[Slide: Brand Awareness] Category awareness is at 78%...
```

**System Prompt:** `"You are an Executive Insight Manager."`

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| `max_tokens` | 250 |
| Input capped at | 4000 chars |

#### Output Format
- **Type:** Plain text (3 bullet points)
- **Destination:** PPTX Executive Summary slide
- **Cost Component:** `executive_hero`

---

### 4.8 4P Strategic Recommendations

**Purpose:** Generates structured Product/Price/Place/Promotion recommendations based on all accumulated insights.

**Source File:** `backend/analytics_module/src/ai/__init__.py` → `generate_recommendations()`

#### Data Input
| Input | Source | Description |
|:------|:-------|:------------|
| `insights_list` | Narrator history + slide data | Each item has `insight`, `section`, `slide_id`, optionally `data` |
| `include_slide_data` | Config flag | If true, includes raw data metrics for evidence-based recommendations |

#### Prompt Template: `recommendations.json`

**System Prompt:**
```
"You are a Business strategist. Output only valid JSON with keys Product, Price,
Place, Promotion. Each value is an array of recommendation strings."
```

**User Prompt:**
```
Based on the following insights from a market research report, generate
actionable Business recommendations. Structure your response as JSON only
with exactly four keys: "Product", "Price", "Place", "Promotion".
Each key must be an array of strings. Provide 3–10 bullets per category.

Insights:
{insights_text}
```

#### API Call Parameters
| Parameter | Value |
|:----------|:------|
| `max_tokens` | 800 |
| `response_format` | Not specified (parsed manually) |

#### Output Schema
```json
{
  "Product": ["Introduce a lighter variant targeting health-conscious consumers..."],
  "Price": ["Current premium positioning is sustainable given 78% conversion..."],
  "Place": ["Expand into convenience channels where competitor X is under-indexed..."],
  "Promotion": ["Launch a digital-first taste comparison campaign on social media..."]
}
```

- **Destination:** `SurveyReport.insights.recommendations_4p`
- **Cost Component:** `recommendations`

---

## 5. AI Persona System

**Source File:** `backend/analytics_module/src/ai/personas.py`

The system dynamically adjusts the AI's "voice" based on the research context using a **PersonaManager**.

### Persona Selection Logic

| Research Type | Active Persona | Voice Characteristics |
|:-------------|:---------------|:---------------------|
| `BA/PF` (Brand/Funnel) | Brand Strategist | Conversion, purchase funnels, market positioning |
| `TasteTest` / `ProductPlacement` | Product Researcher | Sensory attributes, preference drivers, benchmarks |
| Default | Market Analyst | Statistical significance, volume shares, demographics |

### Archetype Enrichment

An optional brand archetype modifier further adjusts tone:
```
BRAND ARCHETYPE: Challenger. Adapt your tone accordingly
(e.g., Challenger = aggressive, Leader = defensive-growth).
```

### System Prompt Construction
```python
final_prompt = f"{persona_directive}{archetype_directive}\n\n{base_prompt_from_template}"
```

---

## 6. Caching & Performance Layer

**Source File:** `backend/analytics_module/src/ai/insight_cache.py` → `InsightCacheManager`

### Architecture: MongoDB-Backed Semantic Cache

```
Collection: ai_insight_cache

Document Schema (per AIInsightCacheEntry):
├── survey_id          → Foreign key
├── component_type     → "chart_insight" | "verbatim_brand_scoped"
├── component_key      → "pref_overall_BrandA_BrandB" (unique per chart)
├── prompt_version     → "1.1.0" (from JSON template)
├── prompt_hash        → SHA-256 of full prompt text
├── ai_headline        → Cached headline string
├── ai_deep_analysis   → Cached analysis array
├── raw_response       → Original LLM response (for debugging)
├── model_used         → "gpt-4o-mini"
├── prompt_tokens      → 1234
├── completion_tokens  → 567
├── cost_usd           → 0.000891
├── created_at         → ISO timestamp
├── last_accessed_at   → ISO timestamp (updated on every read)
└── expires_at         → Optional TTL
```

### Cache Strategy

| Operation | Logic |
|:----------|:------|
| **Read** | Match on `(survey_id, component_type, component_key, prompt_version)` |
| **Invalidation** | If `prompt_hash` changes (template updated but same version) |
| **Force Regen** | `invalidate_survey(survey_id)` deletes ALL entries for that survey |
| **Telemetry** | `get_survey_cache_stats()` aggregates cost savings per survey |

### Cache Hit Flow
```
ChartInsightEngine.generate(chart)
  ├─ cache.get_cached(survey_id, "chart_insight", chart.chart_id, "1.1.0")
  │   ├─ HIT  → return (headline, analysis) immediately
  │   └─ MISS → call OpenAI → save to cache → return result
```

---

## 7. Cost Tracking & Telemetry

**Source File:** `backend/analytics_module/src/ai/api_cost.py` → `CostTracker`

### Pricing Model

```python
PRICES_PER_TOKEN = {
    "gpt-4.1":    {"input": 5.00 / 1_000_000, "output": 15.00 / 1_000_000},
    "gpt-4o":     {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
    "gpt-4o-mini": {"input": 0.150 / 1_000_000, "output": 0.600 / 1_000_000},
}
```

### Model Normalization
The tracker uses prefix matching to handle versioned model names:
- `gpt-4o-mini-2024-07-18` → `gpt-4o-mini`
- `gpt-4o-2024-05-13` → `gpt-4o`
- `gpt-4-turbo` → `gpt-4.1`

### Lifecycle

```
1. api_cost.reset()                    ← Called at pipeline start
2. api_cost.add_from_openai_response() ← Called by each AI component
3. api_cost.get_summary()              ← Returns aggregate report
4. api_cost.save(output_dir)           ← Writes JSON + TXT to filesystem
```

### Output: Cost Manifest

```json
{
  "total_prompt_tokens": 15234,
  "total_completion_tokens": 4567,
  "total_tokens": 19801,
  "total_cost_usd": 0.034521,
  "by_component": {
    "chart_insights": { "prompt_tokens": 8000, "completion_tokens": 2400, "cost_usd": 0.021, "calls": 12 },
    "verbatim_likes_abu_auf": { "prompt_tokens": 1500, "completion_tokens": 500, "cost_usd": 0.003, "calls": 1 },
    "decoder": { "prompt_tokens": 3000, "completion_tokens": 800, "cost_usd": 0.005, "calls": 2 },
    "executive_summary": { "prompt_tokens": 2734, "completion_tokens": 867, "cost_usd": 0.0055, "calls": 1 }
  }
}
```

### Telemetry Persistence

| Destination | Path |
|:------------|:-----|
| MongoDB | `survey_reports.telemetry.ai_cost_manifest` |
| Filesystem | `reports/{survey_id}/ai_costs/api_cost.json` |
| Filesystem | `reports/{survey_id}/ai_costs/api_cost.txt` (human-readable) |
| API Endpoint | `GET /analytics/reports/{survey_id}/ai-costs` (admin-only) |
| Admin Dashboard | `GET /analytics/admin/ai-quota-status` (aggregated) |

---

## 8. Resilience & Fault Tolerance

**Source File:** `backend/analytics_module/src/ai/__init__.py` → `AIGuard`

### AIGuard — Quota-Aware Execution Wrapper

Every AI call is wrapped in `AIGuard.wrap_call()` (sync) or `AIGuard.wrap_call_async()` (async):

```python
result = await AIGuard.wrap_call_async(
    slide_id="chart_pref_overall",
    func=_do_generate_async,
    survey_id=survey_id
)
```

### Error Classification

| Category | Detection | Action |
|:---------|:----------|:-------|
| `429 / Quota / RateLimit` | Keyword match in error message | Return `FALLBACK_MSG` + alert admin via `QuotaMonitor` |
| `Auth (401)` | Keyword match | Abort retries immediately |
| `Timeout` | Exception type | Retry with backoff |
| `Network` | Connection errors | Retry with backoff |

### Fallback Behavior

| Component | On Failure |
|:----------|:-----------|
| Chart Insights | Empty headline + empty analysis array |
| Verbatim | Empty dict |
| Slide Insights | Empty string |
| Executive Summary | Professional fallback message with all charts intact |
| Recommendations | Generic advice: "Manual review of charts recommended." |

### Pipeline-Level Resilience

In `analytics_service.py`, parallel AI tasks use `asyncio.gather(return_exceptions=True)`:
```python
results = await asyncio.gather(*tasks, return_exceptions=True)
# Individual task failures don't crash the pipeline
```

---

## 9. File Reference Map

### AI Core Modules

| File | Component | Purpose |
|:-----|:----------|:--------|
| `backend/analytics_module/src/ai/__init__.py` | Slide Insights + Recommendations + AIGuard | Main AI module with generate_insight(), generate_recommendations() |
| `backend/analytics_module/src/ai/api_cost.py` | CostTracker | Token + cost tracking singleton |
| `backend/analytics_module/src/ai/prompt_registry.py` | PromptRegistry | Centralized prompt loader + safe formatter |
| `backend/analytics_module/src/ai/personas.py` | PersonaManager | Research-type persona switching |
| `backend/analytics_module/src/ai/verbatim_analyzer.py` | VerbatimAnalyzer | Brand-scoped verbatim + cross-brand synthesis |
| `backend/analytics_module/src/ai/executive.py` | ExecutiveSynthesizer | PPTX hero summary |
| `backend/analytics_module/src/ai/insight_cache.py` | InsightCacheManager | MongoDB-backed AI response cache |
| `backend/analytics_module/src/ai/utils.py` | parse_json_robustly | Robust JSON extraction from LLM responses |
| `backend/analytics_module/src/ai/quota_monitor.py` | QuotaMonitor | Admin alert system for quota exhaustion |

### Orchestration

| File | Component | Purpose |
|:-----|:----------|:--------|
| `backend/analytics_module/report_orchestrator.py` | ReportOrchestrator | Top-level coordinator: runs pipeline, builds sections, saves report |
| `backend/analytics_module/insight_aggregator.py` | InsightAggregator | Executive synthesis (summary, SWOT, 4Ps) |
| `backend/analytics_module/chart_insight_engine.py` | ChartInsightEngine | Per-chart dual-output (headline + deep analysis) |
| `backend/analytics_module/web_serializer.py` | WebReportSerializer | Converts payloads to ChartPayload JSON |
| `backend/services/analytics_service.py` | AnalyticsService | API service layer, background task management |

### Data Processing with AI

| File | Component | Purpose |
|:-----|:----------|:--------|
| `backend/analytics_module/src/response_decoder/__init__.py` | Decoder Runner | Orchestrates unaided brand mapping |
| `backend/analytics_module/src/response_decoder/unaided.py` | ai_brand_map | LLM-based brand variant mapping |
| `backend/analytics_module/src/Calculations/percentages.py` | ai_percentages | Open-end response classification |

### Prompt Templates

| File | Version | Used By |
|:-----|:--------|:--------|
| `backend/resources/analytics/prompts/chart_insights.json` | 1.1.0 | ChartInsightEngine |
| `backend/resources/analytics/prompts/slide_insights.json` | 1.1.0 | generate_insight() |
| `backend/resources/analytics/prompts/verbatim_analysis.json` | 1.2.0 | VerbatimAnalyzer |
| `backend/resources/analytics/prompts/recommendations.json` | 1.1.0 | generate_recommendations() |
| `backend/resources/analytics/prompts/executive_summary.json` | 1.0.0 | (Available, used by registry) |

### API Endpoints

| Endpoint | Method | Purpose |
|:---------|:-------|:--------|
| `/analytics/generate-report/{survey_id}` | POST | Triggers full pipeline |
| `/analytics/report/{survey_id}` | GET | Returns full report JSON |
| `/analytics/reports/{survey_id}/ai-costs` | GET | AI cost manifest (admin) |
| `/analytics/admin/ai-quota-status` | GET | Platform-wide AI usage stats |
| `/analytics/admin/ai-alerts` | GET | Unresolved quota/rate alerts |

### Models (Pydantic)

| Model | File | Purpose |
|:------|:-----|:--------|
| `ChartPayload` | `backend/models.py` | Universal chart data envelope |
| `ReportSection` | `backend/models.py` | Logical section grouping |
| `ReportInsights` | `backend/models.py` | Executive summary + SWOT + 4Ps |
| `SurveyReport` | `backend/models.py` | Root MongoDB document |
| `AIInsightCacheEntry` | `backend/models.py` | Cache entry schema |

---

> **End of AI Architecture Reference**
