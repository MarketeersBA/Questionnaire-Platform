# Glossary

> **Audience:** All teammates — especially those new to market research operations or this platform.  
> **Purpose:** Define domain terms used across Questioner documentation and the admin portal.  
> **Related:** [product-overview.md](product-overview.md) · [respondent-flow.md](../guides/respondent-flow.md)

---

## How to Use This Glossary

Terms are grouped by category. Cross-references point to related entries. For workflow context, see [survey-lifecycle.md](../guides/survey-lifecycle.md).

---

## Platform & Study Design

| Term | Definition |
|------|------------|
| **Questioner** | The survey qualification and market-research platform described in this documentation. |
| **Template** | A reusable, versioned survey blueprint defining Layer 1 and Layer 2 question structures, screening logic, and study type. |
| **Blueprint** | Synonym for template — the structural design before a live study is launched. |
| **Survey** | A live study instance created from a template. Includes client name, brands, quotas, gates, and a frozen snapshot of the template schema. |
| **Template snapshot** | Copy of the template schema stored on the survey at creation time. Protects active fieldwork from later template edits. |
| **Schema versioning** | System that tracks template versions so changes are auditable and prior versions can be referenced. |
| **Study type** | Category of research (e.g. taste test, product test, brand tracker) that determines available questions and analytics. |

---

## Access & Identity

| Term | Definition |
|------|------------|
| **Token** | A unique UUID that grants one respondent access to one survey. Shared as a link: `/s/{token}`. |
| **Token batch** | A group of tokens generated together for a campaign (e.g. 1,000 links for Wave 1). |
| **Token link** | Full URL given to a respondent, e.g. `https://domain.com/s/abc-123-uuid`. |
| **Token status** | Lifecycle state: `unused`, `passed`, `failed`, or `submitted`. See [respondent-flow.md](../guides/respondent-flow.md). |
| **Respondent** | A person who enters the survey via a token link. Identified primarily by phone number after Layer 1. |
| **Phone binding** | Linking a token to a respondent's phone number after successful Layer 1 submission. |
| **JWT** | JSON Web Token used for admin, analyst, and client login to the portal (not used by respondents). |
| **Role** | Portal access level: `admin`, `analyst`, or `client`. |

---

## Survey Layers

| Term | Definition |
|------|------------|
| **Layer 1 (L1)** | Screening phase — demographics, eligibility checks, quotas. Also called "screening". |
| **Layer 2 (L2)** | Evaluation phase — main research questions for qualified respondents only. |
| **Screening gate** | A rule that must pass for a respondent to continue (e.g. age 18–35, specific gender, target area). |
| **Quota** | Maximum number of respondents allowed overall or within a demographic cell (e.g. 50 males aged 25–34). |
| **Screen-out** | When a respondent fails Layer 1 or hits a full quota — token becomes `failed`. |
| **In-app gateway** | Modern Layer 2 path where questions render inside Questioner (no external form). |
| **Google Forms path** | Legacy Layer 2 path — redirect to Google Form; answers return via webhook. |

---

## Respondent Lifecycle

| Term | Definition |
|------|------------|
| **unused** | Token generated but respondent has not completed Layer 1 (or has not started). |
| **passed** | Respondent passed Layer 1 but has not yet completed Layer 2. Dashboard label: *verified incomplete*. |
| **failed** | Respondent rejected at Layer 1 or quota. Dashboard label: *rejected*. Terminal state. |
| **submitted** | Respondent completed Layer 2. Dashboard label: *verified complete*. Terminal success state. |
| **Lifecycle filter** | Dashboard filter grouping tokens: pending, verified incomplete, verified complete, rejected, excluded. |
| **Excluded** | Token manually or systematically excluded from reporting (does not delete data). |

---

## Research Modules & Methodologies

| Term | Definition |
|------|------------|
| **Module** | A standardized research block (purchase funnel, brand usage, brand pricing) loaded from the database. |
| **Purchase funnel (PF)** | Sequence measuring awareness → consideration → trial → purchase for brands. |
| **Brand awareness (BA)** | Metrics for whether respondents know a brand (top-of-mind, aided, unaided). |
| **BA & PF export** | Excel file with one row per respondent combining brand awareness and purchase funnel columns. |
| **Product scalers** | Rating scales for product attributes (taste, texture, appearance, etc.) per brand. |
| **Product scalers export** | Excel file with one row per brand per respondent (stacked format for pivot tables). |
| **Taste test** | Study type focused on sensory evaluation of products or prototypes. |
| **Product Test** | Study type using IHUT (in-home use) and optional packaging evaluation question banks. |
| **IHUT** | In-Home Use Test — respondents evaluate products in their own environment. |
| **Package test** | Evaluation of packaging design, clarity, and shelf appeal. |
| **Attribute bank** | Library of sensory or product attributes used in taste/product tests. |
| **Brand** | A product or company name evaluated in Layer 2 (client brand + competitors). |

---

## Analytics & Reporting

| Term | Definition |
|------|------------|
| **Analytics pipeline** | Backend process: ingest responses → aggregate statistics → generate charts → optional AI narratives → store report. |
| **Survey report** | Generated analytical output for a survey — charts, tables, insights stored in the database. |
| **Web report** | Interactive report viewed in the browser (Survey Report page). |
| **Chart insight** | AI-generated narrative explaining what a specific chart shows. |
| **Executive summary** | High-level AI-written overview of study findings. |
| **SWOT** | Strengths, weaknesses, opportunities, threats synthesis (where enabled in reporting). |
| **PPTX export** | PowerPoint deck generated from a survey report for client presentations. |
| **Ingestor** | Component that reads raw MongoDB responses and converts them to analysis-ready structures. |
| **Aggregator** | Component that computes statistics (means, distributions, top-two-box percentages). |
| **Brand Analyzer** | Specialized analytics submodule for brand awareness and funnel metrics. |

---

## Technical & Operations Terms

*Included because they appear in rollout docs and analyst conversations — explained in plain language.*

| Term | Definition |
|------|------------|
| **Webhook** | Automated HTTP callback — e.g. Google Forms sends submission data to Questioner when a respondent completes an external form. |
| **Orphan submission** | A Layer 2 response that could not be matched to a valid token (logged for investigation). |
| **GridFS** | MongoDB file storage used for large binaries: voice recordings, packaging images, trial media. |
| **Redis** | In-memory data store used for caching AI results and queuing background jobs. |
| **Redis queue** | Job queue backed by Redis — e.g. PPTX export tasks waiting to be processed by a worker. |
| **PPTX worker** | Background process that picks up export jobs from the queue and builds PowerPoint files. |
| **MongoDB** | Primary database storing templates, surveys, tokens, responses, and reports. |
| **Seed script** | One-time or repeatable script that loads reference data (question banks, modules) into the database. |
| **Rollout stage** | Environment flag controlling gradual enablement of new features (e.g. module system Phase 9). |
| **Swagger / OpenAPI** | Interactive API documentation available at `/docs` when the backend is running (for developers). |

---

## Abbreviations Quick Reference

| Abbreviation | Full form |
|--------------|-----------|
| **BA** | Brand Awareness |
| **PF** | Purchase Funnel |
| **BA & PF** | Combined brand awareness + purchase funnel export |
| **L1** | Layer 1 (screening) |
| **L2** | Layer 2 (evaluation) |
| **IHUT** | In-Home Use Test |
| **PPTX** | PowerPoint presentation format |
| **JWT** | JSON Web Token (portal login) |
| **UUID** | Universally unique identifier (token format) |
| **SES** | Socio-Economic Status (composite screening score) |
| **T2B** | Top-Two-Box percentage (ratings in top two scale points) |
| **MCQ** | Multiple Choice Question |
| **API** | Application Programming Interface |
| **CI/CD** | Continuous Integration / Continuous Deployment |

---

## Common Phrases Explained

| Phrase | Meaning |
|--------|---------|
| "Token is stuck at passed" | Respondent finished screening but not Layer 2 — follow up or wait. |
| "Quota full" | Demographic cell reached its limit; new respondents in that cell are rejected. |
| "Phase Empty" (Product Test) | Question bank not seeded — blueprint cannot be built. |
| "Generate report" | Trigger analytics pipeline to build or refresh the web report for a survey. |
| "Flat export" | One row per respondent (BA & PF). |
| "Stacked export" | One row per brand per respondent (product scalers). |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [product-overview.md](product-overview.md) | Feature descriptions using these terms |
| [respondent-flow.md](../guides/respondent-flow.md) | Token states in context |
| [survey-lifecycle.md](../guides/survey-lifecycle.md) | When terms apply in a study timeline |
| [analyst-guide.md](../guides/analyst-guide.md) | Exports and reports in practice |

---

*Part of the Questioner documentation handover — [docs/README.md](../README.md)*
