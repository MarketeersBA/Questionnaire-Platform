# 📋 Marketeers Survey — Question Bank Reference

This directory contains the **complete question bank** for all research modules used by the Marketeers Survey Platform. Each CSV file maps directly to the runtime survey modules used in production.

## 📁 Files

| File | Module | Layer | Description |
|------|--------|-------|-------------|
| `01_purchase_funnel.csv` | Purchase Funnel | L2 | Awareness + Purchase Behavior (7 questions) |
| `02_taste_test.csv` | Taste Test | L2 | Sensory evaluation across brands & attributes |
| `03_brand_usage.csv` | Brand Usage | L5 | Recency, frequency, timing & occasion (4 questions) |
| `04_brand_pricing_behavior.csv` | Brand Pricing Behavior | L6 | Budget, stocking, channels & pack sizes (4 questions) |
| `05_brand_analyzer.csv` | Brand Analyzer | L7 | Aided awareness, perception grid & satisfaction (3 questions) |

## 🔑 CSV Columns

| Column | Description |
|--------|-------------|
| `module` | Research module identifier |
| `section` | Logical grouping within the module |
| `question_id` | Unique question code used in the database |
| `question_label` | Short analytical label |
| `type` | Question type: `open_single`, `open_loop`, `scq`, `mcq`, `grid`, `loop` |
| `en_text` | English question text |
| `ar_text` | Arabic question text |
| `options_en` | Available options (English), pipe-separated |
| `options_ar` | Available options (Arabic), pipe-separated |
| `brand_pipeline` | Filtering logic referencing prior questions |
| `example_answer` | Representative example of answer data |

## 🧩 Question Types

| Code | Meaning | Answer Format |
|------|---------|---------------|
| `open_single` | Free text (single entry) | `"Dove"` |
| `open_loop` | Free text (multiple entries) | `["Dove", "Lux"]` |
| `scq` | Single-choice question | `"Every day"` |
| `mcq` | Multiple-choice question | `["Brand A", "Brand B"]` |
| `grid` | Attribute × Brand matrix | `{"trustworthy": ["Brand A"], "innovative": ["Brand B"]}` |
| `loop` | Per-brand repeated question | `{"Brand A": 4, "Brand B": 3}` |
