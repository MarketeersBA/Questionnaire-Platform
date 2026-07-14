# Brand Equity Analyzer - Complete Technical Documentation

> **Purpose**: This document explains the science, methodology, mathematical formulas, data pipeline, and outputs of the Marketeers Brand Equity Analyzer. It is designed for learning sessions and presentations.

---

## Table of Contents

1. [What Is Brand Equity Analysis?](#1-what-is-brand-equity-analysis)
2. [Core Concepts](#2-core-concepts)
3. [Inputs Required](#3-inputs-required)
4. [The Complete Pipeline (Step by Step)](#4-the-complete-pipeline-step-by-step)
5. [Mathematical Formulas in Detail](#5-mathematical-formulas-in-detail)
6. [Outputs and How to Read Them](#6-outputs-and-how-to-read-them)
7. [POP / POD / Strong / Unassociated Classification](#7-pop--pod--strong--unassociated-classification)
8. [Architecture and Module Map](#8-architecture-and-module-map)
9. [Worked Example](#9-worked-example)
10. [Glossary](#10-glossary)

---

## 1. What Is Brand Equity Analysis?

Brand Equity measures **how much value a brand's name adds** beyond the functional benefits of its products. The Brand Equity Analyzer quantifies this by answering:

- **Which brand has the strongest overall equity?** (CBI score)
- **Which attributes drive brand preference?** (Correlation & T-values)
- **How is each brand positioned on each attribute relative to competitors?** (POP/POD matrix)

The analyzer combines **three data sources** to produce these answers:

| Data Source | What It Captures |
|---|---|
| Brand-Attribute Scores | How respondents rate each brand on each attribute |
| Preference Share / Purchase Intent | Which brand each respondent prefers or intends to buy |
| Brand Awareness | How many respondents are aware of each brand |

---

## 2. Core Concepts

### 2.1 Brand Utility

Brand Utility represents **how much of a respondent's total preference goes to each brand**. It is the preference share rebased to 100% per respondent.

**Why rebase?** Different respondents may express preference at different scales. Rebasing ensures every respondent contributes equally to the analysis.

```
For respondent i, brand j:
    Utility(i,j) = PrefShare(i,j) * 100 / Sum_over_all_brands(PrefShare(i,j))
```

### 2.2 Two Score Types

| Score Type | Data Format | Aggregation | Example |
|---|---|---|---|
| **Check** (Binary) | 0 or 1 per respondent per attribute-brand cell | Sum of checks (frequency counts) | "Does Brand X have attribute Y?" Yes=1, No=0 |
| **Scalar** (Scale) | Numeric rating (e.g. 1-10) per respondent per attribute-brand cell | Mean of ratings | "Rate Brand X on attribute Y from 1 to 10" |

### 2.3 Two Sheet Layouts

The scores CSV can be organized two ways:

- **Brands within Attributes**: Columns = `[Attr1-Brand1, Attr1-Brand2, ..., Attr2-Brand1, Attr2-Brand2, ...]`
- **Attributes within Brands**: Columns = `[Brand1-Attr1, Brand1-Attr2, ..., Brand2-Attr1, Brand2-Attr2, ...]`

The system reshapes data differently depending on the layout (`arr_transform` vs `arr_transform_new`).

---

## 3. Inputs Required

### 3.1 Scores File (CSV)

- **Rows** = Respondents
- **Columns** = Attributes x Brands (order depends on the chosen layout)
- **Values** = 0/1 (check mode) or numeric rating (scalar mode)

### 3.2 Attribute Names

List of brand attributes being measured (e.g., "Trusted Brand", "Innovative Brand", "Value for Price").

### 3.3 Brand Names

List of brands being compared (e.g., "Brand A", "Brand B", "Brand C").

### 3.4 Preference Share / Purchase Intent

A flat list of values, length = `Respondents x Brands`. Each value represents how much a respondent prefers a given brand. Laid out as: `[R1-B1, R1-B2, ..., R1-Bn, R2-B1, R2-B2, ..., R2-Bn, ...]`

### 3.5 Brand Awareness (Check Mode Only)

A list of awareness counts per brand. For each brand, the first value is total sample awareness, followed by segment-specific awareness counts.

**Length** = `Brands x (1 + Number_of_Segments)`

### 3.6 Optional Inputs

- **Loyalty / MOU** (Step 4): UI exists but is **not connected** to any calculation logic in this Python port. The text area is a dead placeholder carried over from the C# original.
- **Correlation Variables** (Step 5): UI exists (checkboxes, variable names, text areas) but is **not connected** to any calculation logic. Another dead placeholder from the C# port.
- **Segmentation** (Step 6): **Only respondent segmentation is functional.** It filters which respondents are included in the analysis and selects the correct brand awareness column. Brand and attribute segmentation objects are initialized with empty strings and always resolve to "No Segmentation" (all indices included) -- there is no UI input to populate them.

---

## 4. The Complete Pipeline (Step by Step)

Here is the exact processing sequence from raw inputs to final outputs:

```
                       INPUTS
                         |
          +--------------+--------------+
          |              |              |
    Scores CSV    Pref Share /PI    Brand Awareness
          |              |              |
          v              v              v
   +------+------+  +---+---+    +-----+-----+
   | Parse Scores|  |Validate|   | Validate  |
   | into 2D Grid|  |PI Count|   | Awareness |
   +------+------+  +---+---+    +-----+-----+
          |              |              |
          v              v              |
   +------+------+  +---+---+          |
   | Apply        |  | Build |          |
   | Segmentation |  | Brand |          |
   | Filters      |  |Utility|          |
   +------+------+  +---+---+          |
          |              |              |
          v              v              |
   +------+------+  +---+---+          |
   | Reshape /   |  |Flatten |          |
   | Transform   |  |Utility |          |
   | for Corr.   |  |to 1D   |          |
   +------+------+  +---+---+          |
          |              |              |
          +------+-------+              |
                 |                      |
                 v                      |
          +------+------+              |
          | Pearson      |              |
          | Correlations |              |
          +------+------+              |
                 |                      |
          +------+------+              |
          | Weighted     |              |
          | T-Values     |              |
          +------+------+              |
                 |                      |
                 v                      |
          +------+------+              |
          | Aggregate    |              |
          | Frequencies  |<-------------+
          | (Check/Scalar)|             |
          +------+------+              |
                 |                      |
                 v                      |
          +------+------+              |
          | Marginal     |              |
          | Probabilities|              |
          +------+------+              |
                 |                      |
                 v                      |
          +------+------+              |
          | Expected     |              |
          | Attribute    |              |
          | Scores       |              |
          +------+------+              |
                 |                      |
                 v                      |
          +------+------+              |
          | Expected     |              |
          | Attribute    |              |
          | Share (Gap)  |              |
          +------+------+              |
                 |                      |
           +-----+-----+              |
           |           |              |
           v           v              v
    +------+---+  +----+----+  +------+------+
    | Normalize|  | POP/POD |  | Freq / BA   |
    | (shift)  |  | Matrix  |  | Percentages |
    +------+---+  +---------+  +------+------+
           |                          |
           +----------+---------------+
                      |
                      v
               +------+------+
               | CBI Score   |
               | Calculation |
               +------+------+
                      |
                      v
               +------+------+
               | Excel Export |
               | (7 sheets)  |
               +-------------+
```

### Step-by-Step Breakdown

#### Step 4.1: Validation

- Attribute count x Brand count must match the number of score columns
- Preference share length must equal Respondents x Brands
- Brand awareness length must equal Brands x (1 + Segments) [check mode]

#### Step 4.2: Segmentation Filtering

If segmentation is defined, filter respondent/attribute/brand indices to include only the selected segment. Otherwise, use all indices.

#### Step 4.3: Zero-Preference Exclusion

Respondents whose total preference across all selected brands is zero are excluded. These respondents provide no signal about brand preference and would distort correlations.

#### Step 4.4: Build Brand Utility

For each remaining respondent, extract their preference shares for the selected brands and **rebase to 100%**:

```
For respondent i:
    Total = Sum of PrefShare(i, brand_j) for all selected brands j
    Utility(i, j) = PrefShare(i, j) * 100 / Total
```

#### Step 4.5: Flatten Utility to 1D

The 2D utility matrix (Respondents x Brands) is flattened **column-major** (brand by brand):

```
[R1-B1, R2-B1, ..., Rn-B1, R1-B2, R2-B2, ..., Rn-B2, ...]
```

This aligns with how scores are reshaped for correlation.

#### Step 4.6: Reshape Scores for Correlation

The scores grid is reorganized so that for each attribute column, all respondent-brand pairs are stacked vertically. This creates a matrix of size `(Respondents x Brands) x Attributes`.

This transformation allows computing the **Pearson correlation between each attribute's scores and the brand utility**, pooled across all brands.

#### Step 4.7: Compute Pearson Correlations

For each attribute `a`:

```
Correlation(a) = Pearson(
    utility_1d,                        -- all respondents x all brands utilities
    scores_transformed[:, a]           -- all respondents x all brands scores for attribute a
)
```

This measures **how strongly an attribute drives brand preference overall**. A high correlation means respondents who give a brand higher scores on that attribute also tend to prefer that brand more.

#### Step 4.8: Compute Per-Brand Correlations

In addition to pooled correlations, the system calculates **Pearson correlation per brand per attribute**:

```
For each brand b, attribute a:
    Corr(a, b) = Pearson(
        utility[:, b],      -- all respondents' utility for brand b
        scores[:, a*B + b]  -- all respondents' scores for attribute a, brand b
    )
```

#### Step 4.9: Compute Weighted T-Values

T-values measure the **statistical significance** of each attribute's correlation:

```
For each attribute a:
    T(a) = Correlation(a) * sqrt( (N - 2) / sqrt(1 - Correlation(a)^2) )
    
    where N = number of respondents
```

Then T-values are **standardized and weighted** to a 100-centered scale:

```
    Mean_T = average of all T-values
    StdDev_T = standard deviation of all T-values
    
    Weighted_T(a) = 100 + (T(a) - Mean_T) / (StdDev_T / 5)
```

**Interpretation**: Attributes with Weighted_T > 100 are **above-average drivers** of preference. Below 100 means below average.

#### Step 4.10: Aggregate Frequencies

**Check Mode**: Count how many respondents checked each attribute-brand cell:

```
CheckFreq(a, b) = Sum over respondents of Score(respondent, a, b)
```

**Scalar Mode**: Average rating per attribute-brand cell:

```
ScalarFreq(a, b) = Mean over respondents of Score(respondent, a, b)
```

#### Step 4.11: Compute Marginal Probabilities

These represent **what we would expect if attribute associations were independent of brand**.

**Check Mode**:

```
P(attribute a) = Sum_over_brands(CheckFreq(a, b)) / TotalChecks
P(brand b) = Sum_over_attrs(CheckFreq(a, b)) / TotalChecks
```

**Scalar Mode**:

```
P(attribute a) = (Sum_over_brands(ScalarFreq(a, b)) / BrandCount) / AvgScalar
P(brand b) = (Sum_over_attrs(ScalarFreq(a, b)) / AttrCount) / AvgScalar
```

#### Step 4.12: Compute Expected Attribute Scores

The expected score under the independence assumption:

```
Expected(a, b) = P(attribute a) * P(brand b) * Total
```

Where `Total` = TotalChecks (check mode) or AvgScalar (scalar mode).

This is the score we would expect **if there were no special brand-attribute associations** -- purely based on how popular the attribute is overall and how popular the brand is overall.

#### Step 4.13: Compute Expected Attribute Share (Gap Analysis)

The **gap** between observed and expected:

```
Gap(a, b) = ObservedFrequency(a, b) - Expected(a, b)
```

- **Positive gap**: The brand is associated with this attribute **more than expected** (a strength)
- **Negative gap**: The brand is associated with this attribute **less than expected** (a weakness)
- **Zero gap**: Exactly what we'd expect from base rates

#### Step 4.14: Normalize the Gap Matrix

Shift all values so the minimum becomes zero:

```
MinGap = minimum value across all Gap(a, b)
NormalizedGap(a, b) = Gap(a, b) + |MinGap|
```

This ensures all values are non-negative for the CBI calculation.

#### Step 4.15: Compute CBI (Composite Brand Index)

CBI is the **final brand equity score**. It combines three factors:

```
Score(a, b) = NormalizedGap(a, b) * FrequencyPct(a, b) * WeightedT(a)
```

Where:
- `NormalizedGap(a, b)` = how much stronger/weaker the association is vs. expected
- `FrequencyPct(a, b)` = the frequency as a percentage of brand awareness (check) or raw scalar frequency
- `WeightedT(a)` = the statistical importance of the attribute as a driver

Then:

```
BrandScore(b) = Sum_over_attributes(Score(a, b)) / AttributeCount
AverageBrandScore = Sum_over_brands(BrandScore(b)) / BrandCount
CBI(b) = BrandScore(b) * 100 / AverageBrandScore
```

**Interpretation**:
- **CBI = 100**: Average brand equity
- **CBI > 100**: Above-average equity (the brand is stronger than the market average)
- **CBI < 100**: Below-average equity (the brand is weaker than the market average)

#### Step 4.16: Build POP/POD Matrix

Uses the un-normalized Gap matrix (Step 4.13) to classify each attribute-brand cell. See Section 7 for the full classification logic.

#### Step 4.17: Excel Export

Produces a multi-sheet Excel workbook with 7+ sheets:

| Sheet | Content |
|---|---|
| 1 | **CBI Table**: Brand names and their CBI scores |
| 2 | **Correlations & T-Values**: Each attribute's pooled correlation (%) and weighted T-value |
| 3 | **POP/POD Matrix**: Classification of each attribute-brand cell (POP, POD, Strong, Unassoc, or blank) |
| 4 | **Scores**: Raw check frequencies or scalar means per attribute-brand |
| 5 | **Normalized Matrix**: The gap (observed - expected) per attribute-brand |
| 6 | **% of Respondents Awareness** (check mode only): Frequency as a fraction of brand awareness |
| 7 | **Correlation Per Brand**: Per-brand per-attribute Pearson correlations |

---

## 5. Mathematical Formulas in Detail

### 5.1 Pearson Correlation

```
Given paired arrays X and Y of length n:

    mean_X = (1/n) * Sum(X_i)
    mean_Y = (1/n) * Sum(Y_i)
    
    Cov(X, Y) = Sum( (X_i - mean_X) * (Y_i - mean_Y) )
    Var(X) = Sum( (X_i - mean_X)^2 )
    Var(Y) = Sum( (Y_i - mean_Y)^2 )
    
    Pearson(X, Y) = Cov(X, Y) / sqrt(Var(X) * Var(Y))
```

Range: -1 (perfect negative) to +1 (perfect positive).

### 5.2 Sample Variance and Standard Deviation

```
    Variance = (Sum(X_i^2) - (Sum(X_i))^2 / n) / (n - 1)
    StdDev = sqrt(Variance)
```

Uses the Bessel-corrected (n-1) formula.

### 5.3 T-Statistic for Correlation

```
    T = r * sqrt( (n - 2) / sqrt(1 - r^2) )
```

Where `r` = Pearson correlation, `n` = number of respondents.

Note: This formula differs slightly from the standard t-test for correlation (`r * sqrt((n-2) / (1-r^2))`). The outer `sqrt` in the denominator is specific to this implementation's weighting scheme.

### 5.4 CBI Formula

```
    CBI(brand b) = ( Sum_a[ NormGap(a,b) * FreqPct(a,b) * Wt_T(a) ] / A ) * 100 / AvgBrandScore

    Where:
        A = number of attributes
        AvgBrandScore = (1/B) * Sum_b[ Sum_a[ NormGap(a,b) * FreqPct(a,b) * Wt_T(a) ] / A ]
        B = number of brands
```

---

## 6. Outputs and How to Read Them

### 6.1 CBI (Composite Brand Index)

| CBI Value | Meaning |
|---|---|
| > 120 | Very strong brand equity, significantly above market average |
| 100 - 120 | Above average brand equity |
| 100 | Exactly average |
| 80 - 100 | Below average brand equity |
| < 80 | Weak brand equity, significantly below market average |

The CBI is **relative** -- it always averages to 100 across all brands. It tells you which brands are stronger or weaker *compared to the set being analyzed*.

### 6.2 Correlations

| Correlation (%) | Meaning |
|---|---|
| > 30% | Strong driver of brand preference |
| 15% - 30% | Moderate driver |
| 5% - 15% | Weak driver |
| < 5% | Not a meaningful driver |
| Negative | Inverse relationship (higher score = less preference) |

### 6.3 Weighted T-Values

| Weighted T | Meaning |
|---|---|
| > 110 | Attribute is a very important driver (well above average) |
| 100 - 110 | Above average importance |
| 100 | Average importance |
| 90 - 100 | Below average importance |
| < 90 | Attribute is not an important driver |

### 6.4 Normalized Matrix (Gap Values)

- **Large positive values**: Brand strongly over-performs on this attribute vs. expectation
- **Values near zero**: Brand performs as expected
- **Values are always >= 0** after normalization (shifted by the absolute minimum)

### 6.5 POP/POD Matrix

See Section 7 below.

---

## 7. POP / POD / Strong / Unassociated Classification

This is the **strategic positioning output**. For each attribute, brands are classified based on their gap values (observed - expected, before normalization).

### 7.1 The Classification Algorithm

1. **Compute the standard deviation** of all gap values across the entire matrix (all attributes, all brands).

2. For each attribute row, **sort the brands' gap values** in ascending order.

3. Walk through the sorted values and classify each brand:

| Classification | Condition | Strategic Meaning |
|---|---|---|
| **Unassociated** | `gap < -StdDev` | The brand is significantly **below** the expected association for this attribute. The attribute is not linked to this brand. |
| **POD** (Point of Difference) | `gap > +StdDev` AND conditions below are NOT met for Strong or POP | The brand **uniquely owns** this attribute -- it is differentiated from competitors. This is a competitive advantage. |
| **POP** (Point of Parity) | `gap > +StdDev` AND the preceding brand in sorted order is also above threshold with certain proximity rules | Multiple brands share a high association with this attribute. Being here is **necessary but not differentiating** -- it is table stakes. |
| **Strong** | `gap > +StdDev` AND `gap < previous_brand_gap + StdDev` AND previous brand is neither POP nor POD | The brand has a notable association, but it is **close to another brand** that is not a POP/POD. The association is strong but not distinctive enough to be a POD. |
| *(blank)* | `-StdDev <= gap <= +StdDev` | Neutral zone. The brand's association with this attribute is within one standard deviation of expectation -- neither notably strong nor weak. |

### 7.2 How to Read the POP/POD Matrix

```
Example POP/POD Matrix:

  Attribute           | Brand A | Brand B | Brand C | Brand D
  --------------------|---------|---------|---------|--------
  Trusted             | POD     |         |         | Unassoc
  Innovative          |         | POD     | POP     |
  Value for Price     | Strong  | POP     | POP     |
  High Quality        |         |         |         | POD
  Famous              | POP     | POP     |         | Unassoc
```

**Strategic interpretation**:
- **Brand A** uniquely owns "Trusted" -- this is its competitive advantage
- **Brand B** and **Brand C** both have parity on "Innovative" (POP) -- neither can claim differentiation here
- **Brand D** is unknown/unassociated with "Trusted" and "Famous" -- these are its weakness areas
- **Brand D** uniquely owns "High Quality" -- this is its POD

### 7.3 Why This Matters for Strategy

| Finding | Strategic Action |
|---|---|
| Your brand has a **POD** | Protect and amplify this in marketing -- it's your competitive advantage |
| Your brand has a **POP** | Maintain presence here -- it's table stakes for the category |
| Your brand shows **Strong** | This is close to becoming a POP or POD -- consider whether to invest further |
| Your brand is **Unassociated** | Decide: Is this attribute worth building? Or focus resources on existing strengths? |
| Attribute is a POD for a competitor | Attacking this directly is expensive -- consider flanking strategies |

---

## 8. Architecture and Module Map

```
BrandAnalyzerOrig/
|
+-- main.py                 Entry point (--ui for GUI, default = headless)
|
+-- main_window.py          Core orchestrator
|   |-- MainWindow class    7-step wizard UI (tkinter)
|   |-- run_equity_from_data()   Programmatic API (no GUI)
|   |-- _run_calculation()  Pipeline orchestrator
|   |-- _get_brand_utility()     Builds and rebases utility
|   |-- _get_scores()       Loads and subsets score grid
|   |-- _get_check_frequencies() Aggregates check data
|   |-- _get_scalar_frequencies()Aggregates scalar data
|   |-- _exclude_respondents_zero_pref()  Filters out zero-preference respondents
|   +-- _print_output_check/scalar()  Assembles output DataFrames
|
+-- calculations2.py        Mathematical engine
|   |-- get_correlation()    Pearson correlation
|   |-- get_stdev()          Standard deviation
|   |-- arr_transform()      Reshape scores (brands within attrs layout)
|   |-- arr_transform_new()  Reshape scores (attrs within brands layout)
|   |-- corr_calc()          Pooled correlations per attribute
|   |-- corr_per_brand()     Per-brand correlations
|   |-- wt_t_calc()          Weighted T-values
|   |-- get_expected_attribute_score()   Expected under independence
|   |-- get_expected_attribute_share_from_check/scalar()  Gap = Observed - Expected
|   |-- get_normalize_expected_attribute_share()  Shift to non-negative
|   |-- calc_cbi()           Final CBI scores
|   +-- pop_pod_str_unass()  POP/POD/Strong/Unassoc classification
|
+-- excel_engine.py          Excel output (openpyxl)
|   +-- ExcelEngine          Singleton: workbook, sheets, tables, formatting
|
+-- segment.py               Segmentation model
|   +-- Segment              Parse, store, and query segment definitions
|
+-- transposer_dialog.py     Utility to transpose score data
|
+-- purchase_intent.csv      Sample data fixture
+-- requirements.txt         Dependencies: pandas, openpyxl, numpy
```

### Data Flow Between Modules

```
User/Caller
    |
    v
main.py  -->  main_window.py  -->  calculations2.py  (math)
                    |                      |
                    |                      v
                    |               Returns: correlations, T-values,
                    |               expected scores, CBI, POP/POD DataFrame
                    |
                    +----------->  excel_engine.py  (output)
                    |                      |
                    |                      v
                    |               Writes: .xlsx workbook
                    |
                    +----------->  segment.py  (filtering)
                                       |
                                       v
                                  Returns: filtered index lists
```

---

## 9. Worked Example

### Given Data

- **3 Brands**: Alpha, Beta, Gamma
- **2 Attributes**: "Trusted", "Innovative"
- **4 Respondents**
- **Score Type**: Check (0/1)

**Scores CSV** (brands within attributes):

| | Trusted-Alpha | Trusted-Beta | Trusted-Gamma | Innovative-Alpha | Innovative-Beta | Innovative-Gamma |
|---|---|---|---|---|---|---|
| R1 | 1 | 0 | 1 | 0 | 1 | 0 |
| R2 | 1 | 1 | 0 | 1 | 0 | 0 |
| R3 | 0 | 1 | 1 | 0 | 1 | 1 |
| R4 | 1 | 0 | 0 | 1 | 0 | 1 |

**Preference Share** (R1-Alpha, R1-Beta, R1-Gamma, R2-Alpha, ...):

```
30, 50, 20, 60, 30, 10, 10, 40, 50, 70, 10, 20
```

**Brand Awareness**: `[4, 3, 3]` (all 4 respondents aware of Alpha, 3 of Beta, 3 of Gamma)

### Step-by-Step Calculation

**1. Brand Utility** (rebase preference to 100%):

| | Alpha | Beta | Gamma |
|---|---|---|---|
| R1 | 30 | 50 | 20 |
| R2 | 60 | 30 | 10 |
| R3 | 10 | 40 | 50 |
| R4 | 70 | 10 | 20 |

(Already sums to 100 per respondent in this example)

**2. Check Frequencies**:

| | Alpha | Beta | Gamma |
|---|---|---|---|
| Trusted | 3 | 2 | 2 |
| Innovative | 2 | 2 | 2 |

Total checks = 3+2+2+2+2+2 = **13**

**3. Marginal Probabilities**:

```
P(Trusted)    = (3+2+2) / 13 = 7/13 = 0.538
P(Innovative) = (2+2+2) / 13 = 6/13 = 0.462

P(Alpha) = (3+2) / 13 = 5/13 = 0.385
P(Beta)  = (2+2) / 13 = 4/13 = 0.308
P(Gamma) = (2+2) / 13 = 4/13 = 0.308
```

**4. Expected Scores** (under independence):

```
Expected(Trusted, Alpha)    = 0.538 * 0.385 * 13 = 2.692
Expected(Trusted, Beta)     = 0.538 * 0.308 * 13 = 2.154
Expected(Trusted, Gamma)    = 0.538 * 0.308 * 13 = 2.154
Expected(Innovative, Alpha) = 0.462 * 0.385 * 13 = 2.308
Expected(Innovative, Beta)  = 0.462 * 0.308 * 13 = 1.846
Expected(Innovative, Gamma) = 0.462 * 0.308 * 13 = 1.846
```

**5. Gap (Observed - Expected)**:

```
Gap(Trusted, Alpha)    = 3 - 2.692 = +0.308   (over-performs)
Gap(Trusted, Beta)     = 2 - 2.154 = -0.154   (slightly under)
Gap(Trusted, Gamma)    = 2 - 2.154 = -0.154   (slightly under)
Gap(Innovative, Alpha) = 2 - 2.308 = -0.308   (under-performs)
Gap(Innovative, Beta)  = 2 - 1.846 = +0.154   (slightly over)
Gap(Innovative, Gamma) = 2 - 1.846 = +0.154   (slightly over)
```

**6. The gap values** feed into the POP/POD classification and, after normalization and combination with T-values and frequency percentages, into the CBI score.

---

## 10. Glossary

| Term | Definition |
|---|---|
| **CBI** | Composite Brand Index -- the final brand equity score, indexed to 100 |
| **Brand Utility** | A respondent's preference for a brand, rebased so all brands sum to 100% |
| **Preference Share** | Raw measure of how much a respondent prefers each brand |
| **Purchase Intent** | Behavioral intention to buy -- used as a proxy for preference share |
| **Check Data** | Binary (0/1) scores: "Does the brand have this attribute?" |
| **Scalar Data** | Rating scale scores: "How strongly does the brand have this attribute?" |
| **Pearson Correlation** | Statistical measure of linear relationship between two variables (-1 to +1) |
| **T-Value** | Statistical significance measure for correlation |
| **Weighted T** | T-value standardized to a 100-centered scale for use in CBI weighting |
| **Expected Score** | The score we'd expect if brand-attribute associations were independent |
| **Gap** | Observed frequency minus expected frequency (over/under-performance) |
| **Normalized Gap** | Gap shifted so minimum = 0, for non-negative CBI calculation |
| **POP** | Point of Parity -- attribute shared by multiple strong brands (table stakes) |
| **POD** | Point of Difference -- attribute uniquely owned by one brand (competitive advantage) |
| **Strong** | Notable association but close to another non-POP/POD brand |
| **Unassociated** | Brand significantly below expected association for this attribute |
| **Segmentation** | Filtering data by sub-groups (demographics, brand subsets, attribute subsets) |
| **Brand Awareness** | Count of respondents who are aware of a brand (used as denominator in check mode) |
| **Frequency** | Count of checks (check mode) or mean rating (scalar mode) per attribute-brand cell |
| **MOU** | Most Often Used -- loyalty measure (optional input) |

---

## Presentation Tips

1. **Start with the "Why"**: Brand equity matters because it drives pricing power, customer loyalty, and competitive advantage
2. **Show the inputs visually**: A simple example scores table with 3 brands and 3 attributes makes the concept tangible
3. **Walk through the Gap concept**: "What would we expect if there were no special associations?" vs. "What do we actually observe?" is the core insight
4. **Demonstrate POP vs POD**: Use the matrix to show how brands differentiate -- this is the most actionable output for marketing teams
5. **CBI as the summary**: End with CBI as the single number that captures overall brand health
6. **Correlation as the "driver analysis"**: Which attributes actually matter for preference? High correlation = high importance

---

*Documentation generated from the BrandAnalyzerOrig module source code.*
*Module origin: Python port of the Marketeers Brand Equity Analyzer (C# Windows Forms).*
