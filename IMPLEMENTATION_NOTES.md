# Implementation Notes — Survey UX, Theming, Charts, AI/MI (this session)

This documents exactly what was implemented against the approved plan (`C:\Users\User\.claude\plans\act-as-a-senior-ancient-glacier.md`), what was verified, what bugs were found and fixed along the way, and what's left for a follow-up pass. Nothing here has been committed to git — all changes are in your working tree, uncommitted, ready for you to review with `git diff` before committing.

## Phase 1 — Survey welcome screen, centralized RTL, Arabic typography

- **New `welcome` step**: `frontend/src/types/surveyFlow.ts`, `frontend/src/pages/PublicSurvey.tsx`. A fresh respondent now lands on a new animated screen before the screening questions; a respondent resuming a saved session skips straight back to their saved step (verified — the rehydration branch was untouched).
- **New component**: `frontend/src/pages/PublicSurvey/WelcomeScreen.tsx` — a hand-built SVG "pen writing across lines" animation (framer-motion `pathLength` draw + a moving pen icon), followed by a staggered fade/slide-in of greeting → title → subtitle → CTA. Arabic copy: "مرحبا!" / "رأيك يهمنا" / "شاركنا رأيك في دقايق بسيطة وخلّي صوتك يوصل" / "يلا نبدأ". English: "Hey there!" / "Your voice matters" / ... / "Let's Go".
  - **Note on the animation**: I did not add a `lottie-react` dependency or pull a third-party Lottie JSON file, even though that was discussed. A hand-built SVG/framer-motion animation avoids a new runtime dependency and any third-party asset licensing to track, and framer-motion is already used everywhere else in this codebase — it reads as "part of the app" rather than a bolted-on asset. If you'd still prefer a real Lottie illustration, that's a follow-up (add `lottie-react`, source or commission a CC0/licensed JSON, swap it into `WelcomeScreen.tsx`).
- **Centralized RTL**: new `frontend/src/hooks/useSurveyDirection.ts` replaces two separate, inconsistent `isArabicUi`/`isAr` computations in `PublicSurvey.tsx` with one shared source of truth, applied once via `dir={surveyDir}` on the outer page wrapper — every step (welcome/layer1/layer2/module/product_test/submitted) now inherits direction correctly, including the ones that previously had no `dir` at all.
- **Arabic typography**: self-hosted the **Cairo** Arabic typeface (`frontend/public/fonts/Cairo-*.woff2`, weights 400/600/700/800) alongside the existing Pangram Sans, because Pangram Sans has no Arabic glyphs — Arabic text was silently falling back to a generic system font before. `frontend/src/index.css` now applies Cairo to any `[dir="rtl"]` subtree.
- **`MasterLinkRedirect.tsx`**: replaced the bare spinner with a branded, bilingual loading/error card matching the app's visual language.
- **Tests added**: `useSurveyDirection.test.ts` (4 tests), `WelcomeScreen.test.tsx` (2 tests) — all passing.

## Phase 2 — Navy theme, sidebar, fonts

- **New tokens** in `frontend/tailwind.config.js`: `brand.navy` (`#0B1E3D`), `brand.navyLight`, `brand.navyDeep`. **These hex values are my best read of your reference screenshots — I couldn't pixel-sample the actual image, so please confirm/adjust against your brand guide before this ships.**
- **Sidebar** (`frontend/src/components/Layout.tsx`): now a fixed navy gradient background in both light and dark mode (matches your screenshots — the sidebar is intentionally theme-invariant while the main content area still responds to light/dark). Active nav state switched from blue to the brand red accent (matching the red highlight in your dashboard screenshot); all text/icon colors on the sidebar reworked for contrast against navy (inactive `white/60`, active `white`, hover `white/10`).
- **Scope note**: I fully reworked `Layout.tsx` (the sidebar + header shell every page uses). I did **not** do a page-by-page sweep of every module's internal content (Surveys list, Templates, Survey Responses tables, etc.) to replace stray `slate-*`/`gray-*` classes with `brand.grey/greyMid/greyLight` tokens — that's a larger, lower-risk-but-high-file-count pass (6+ large files) that I'd recommend as a fast-follow now that the shell/navy foundation is in place, rather than rushing it here.
- **Fonts/whitespace**: not yet touched beyond the Arabic-specific sizing in Phase 1 — the "bump survey font one step, trim excess padding" pass across `PublicSurvey.tsx`/`SurveyReport.tsx` is deferred to the same fast-follow as the color sweep above, since both are large, visual, iterate-by-eye changes better done with you looking at the running app.

## Phase 3 — Report charts

- **Fixed a real, previously-silent bug**: `backend/analytics_module/aggregator.py`'s `compute_all()` swallows every chart computation's exceptions with only a one-line log warning (no traceback) — I added `exc_info=True` so future failures are actually debuggable. Separately, `brand_profile_analytics()` (the "Appraisal"/Snake chart you asked about) had a fragile filter — if a survey's data has no row where `metric == attribute` (its only rule for "this is the main question"), it silently fell back to averaging **every** sub-metric together, which — per the code's own comment — is exactly the wrong thing (mixing different scales into one meaningless number). I added two graceful fallback tiers (blank-metric-as-main, then one-representative-metric-per-attribute) before it ever does that. **I could not reproduce your exact "it's not showing" report against real data in this environment — please regenerate a report and check whether Appraisal now appears; if not, the backend logs (now with full tracebacks) will show exactly why.**
- **Appraisal is now a real, labeled section**: `frontend/src/pages/SurveyReport.tsx` — `profile_chart`/`likeness_profile` charts now group under a section literally titled **"Appraisal"** instead of the generic "Criteria Analysis" they were silently filed under before.
- **Wired the orphaned `TornadoChart.tsx`** into the report: added `chart_type: 'driver_ranking'` to `ChartRenderer.tsx`'s `CHART_MAP`, and a new `driver_ranking_chart()` method in `aggregator.py` (reuses the same impact/correlation computation as the existing Sub-Attribute Importance Matrix, repackaged as a ranked bar). It's grouped in the "Dashboard" section right after its sibling scatter chart.
- **Found and fixed a real duplicate-key bug** in `SurveyReport.tsx`'s chart-ordering config: `overall_scatter` and `sub_attribute_scatter` were each defined **twice** in the same priority object (TypeScript actually flags this as a compile error — `tsc --noEmit` was failing on this file before my fix). JS silently keeps only the second definition, so the first was dead, misleading code; removed the dead entries.
- **Funnel charts**: confirmed already working (`FunnelChart`, `PurchaseFunnelRatioCardsChart`, `PurchaseFunnelLineChart`) — no changes needed there beyond what's covered by the deferred font/spacing pass in Phase 2.
- **Executive summary / report conclusions**: strengthened `backend/resources/analytics/prompts/executive_summary.json` — the LLM is now explicitly instructed to cite a concrete metric in every section, name one single top-priority action (not a hedge between options) with its expected business outcome, and treat a "generic, could-be-any-brand" summary as a failure.
- **Not done** (flagged, not attempted): a full audit of every report section for "does every insight have an adjacent chart" — I fixed the two specific gaps you named (Appraisal not appearing, driver-ranking chart orphaned) but did not walk all ~25 chart types against all report sections. Recommend doing this with a real generated report in front of us.

## Phase 4 — AI/MI follow-up improvements

- **Faster detection**: reduced the idle-debounce from 3000ms to 1600ms in both `AiFollowUpPanel.tsx` (reply-to-follow-up box) and `TasteTestOpenEndQuestion.tsx` (initial answer box), and added an early-trigger — if the respondent's text ends in `.`, `!`, `?`, or `؟`, the AI fires almost immediately (300ms) instead of waiting out the full idle window.
- **New respondent-facing 1-3 rounds slider**: `frontend/src/components/voice-feedback/FollowUpRoundsSlider.tsx` (new), shown inside `AiFollowUpPanel.tsx`. The respondent's choice can only **lower** the effective round cap, never raise it above the admin's configured "Moderation Depth" — enforced in `frontend/src/hooks/useFollowUpOrchestration.ts` via `Math.min(adminMaxRounds, respondentCap)`. No backend changes were needed for this — the cap is enforced entirely client-side before the request is even sent, and the backend's own admin-side check remains an independent backstop.
  - **Wired end-to-end for taste-test open-end questions only** (`TasteTestOpenEndQuestion.tsx` → `PublicSurvey.tsx`). `PackagingHeatmapQuestion.tsx` and `ProductTestQuestionRenderer.tsx` (the other two consumers of `AiFollowUpPanel`) still need the same 3-line wiring pattern (pass `onMaxRoundsChange` down to the panel) to get the slider — I scoped this to one consumer as the reference implementation given time, rather than touch three files without being able to visually verify each.
- **Smarter, business-aware prompting**: `backend/voice_feedback/nlp_prompts/smart_followup.json` — added an explicit "business-case awareness" instruction block: before probing, the model must silently ask what business decision the survey objective actually hinges on, tailor the probe angle to the question category, and never re-ask something already answered.
  - **Not done**: true cross-question session context (what the respondent said on *other* questions in the survey, not just this one). I looked for existing plumbing to support this and found none — building it safely means adding new data-fetching in `backend/routers/public.py` to pull prior answers from the response document, which is a real scope expansion beyond a prompt edit. Flagging it as a good next step rather than rushing it in.

## Phase 5 — Backend bug-fix policy (opportunistic, as instructed)

Two real bugs found and fixed while verifying the above, unrelated to the plan's main scope but blocking your own local test suite:

1. **`backend/routers/surveys.py:218`** — the `exclude_id` parameter (your own recent uncommitted edit to `check-code`) used `str | None` syntax, which requires Python 3.10+. Your local dev venv here runs Python 3.9.13, so this was crashing the entire app import (`backend/tests/voice_feedback` couldn't even collect). Fixed with `Optional[str]` — behaviorally identical, compatible back to Python 3.7. **Worth double-checking what Python version your team's local dev venvs actually run** — the Docker image is 3.11 (fine either way), but if any teammate's local venv is 3.9 like this one, this bug would have blocked their local test runs too.
2. **`backend/analytics_module/aggregator.py`** — my own new `driver_ranking_chart()` referenced `self.n`, which doesn't exist in the test fixture used by `test_aggregator_compute_all.py` (silently swallowed by the same try/except mentioned above, until I ran the tests and saw the warning). Fixed by reusing `scatter.get("base_n")` from the already-computed sibling chart instead.

## Test results (run this session, not simulated)

**Frontend** (`npm run test` / vitest, `d:\Farida\AWS\Questionnaire-Platform\frontend`):
- **Final: 555/555 passed, 73/73 files.** All 13 originally-failing tests (all pre-existing, none caused by Phase 1-5 work) are now fixed — see "Round 2" below for the actual bugs behind them.
- `npx tsc --noEmit` still reports ~40 pre-existing type errors across ~15 files untouched by this work (e.g. `ReportExportFrame.tsx`, `productTestSnapshotBuilder.ts`, `brandComparisonSeries.ts`). These are compile-time type-safety gaps, not runtime failures — `vitest`/`vite build` don't fail because of them, and the vitest run above is 100% green. Flagging as a separate, real body of work rather than folding it into "test failures," given its size (fixing it properly means touching ~15 unrelated files).

**Backend** (pytest via `venv/Scripts/python.exe -m pytest`, Python 3.9.13 — your local venv):
- **Final: 772 passed, 9 skipped (intentional), 4 failed.** The 4 remaining failures are **not code bugs** — `test_api_contracts.py` (x3) and `test_integration_flow.py::test_full_orchestration_flow` all fail identically with `pymongo.errors.ServerSelectionTimeoutError: SSL handshake failed: ac-5zhndym-shard-00-0*.eamihfe.mongodb.net`. This sandbox cannot reach your real MongoDB Atlas cluster over the network (SSL handshake blocked/no route) — these tests need a genuine DB connection and will very likely pass in your actual dev environment or CI where that connectivity exists. Nothing to fix in code here.
- Two files (`test_clustering_geometry.py`, `test_semantic_precision.py`) are excluded from the count above — they import optional ML packages (`umap`, `sklearn`) not installed in this sandbox venv. Also an environment gap, not a code bug: `pip install umap-learn scikit-learn` if you want to run them locally.

## Round 2 — "solve all the failures" pass

You asked me to fix every failing test, related to this work or not, and give you commands to test locally. Here's every bug found and fixed to get from 13+10 failing to 0 code-fixable failures:

**Frontend (7 real bugs/stale tests fixed):**
1. **`productTestPlaceholderEngine.ts`** — the bare (unbracketed) word "Product"/"المنتج" in question text was never being replaced with the brand name at all (only `[Product]`/`(المنتج)` bracketed/parenthesized forms were handled). This is almost certainly the actual regression from the "Fix product test spaces" commit — added the missing bare-word substitution with proper word-boundary matching (`\bProduct\b`, case-insensitive) so it can't false-match "Production"/"Products". Fixed 5 tests across `productTestPlaceholderEngine.test.ts`, and this same root cause was silently also breaking `productTestPhaseIntro.test.ts` and `productTestGenerator.test.ts` (both passed once this was fixed, no separate change needed).
2. **`moduleSequencePermutations.test.ts`** — stale test written when the module registry had 5 modules; `product_test` and `brand_analyzer` were added later and the test's local `ALL_MODULES` list and expected walk sequence were never updated. Updated both, and gave the test fixture's taste-test section a `module: 'taste_test'` tag that `hasTasteTestLayer2Sections` now requires (a newer, stricter check than when this fixture was written).
3. **`packagingHeatmapSnapshot.test.ts`** — the "at least one click" test used a bare `{x, y}` click with no comment/voice note, but the actual (correct, intentional) validation requires per-pin feedback text — the validation message literally says "add text or a voice note for every selected pin." Updated the test's "complete" fixture to include a comment, matching real product behavior.
4. **`ProductTestQuestionRenderer.test.tsx`** — expected a "Drag the handle or tap the bar" hint under the scale slider that was never actually implemented. Added it for real (bilingual, in `HorizontalScaleSlider.tsx`) rather than deleting the assertion — a genuine small UX/accessibility improvement, not just a test fix.

**Backend (9 real bugs fixed, beyond what Phase 1-5 already covered):**
5. **`backend/models.py`** — `QuestionModuleBase`'s `brand_pipeline` source validation (checking that a module question's pipeline sources reference real question IDs) was **unreachable dead code** — an early `return self` sat directly above it. This means invalid module configs referencing nonexistent question IDs could be saved silently. Moved the `return self` to after the validation loop.
6. **`backend/analytics_module/pptx_builder/hybrid_export/render_mode.py`** — `resolve_render_mode()`'s rollout-stage branch had `if stage == DEFAULT: return NATIVE` / `return NATIVE` — both branches returned the same value, so the DEFAULT rollout stage silently never activated hybrid rendering as documented in this same module's `describe_rollout_policy()`. Fixed the DEFAULT branch to return `HYBRID`, matching the documented policy.
7. **`backend/analytics_module/web_serializer.py`** — `TasteTestNpsSlide` had no dedicated NPS-gauge serializer; it silently fell through to the generic bar-chart path, producing one combined chart instead of one gauge per brand (unlike the live web report's NPS gauge). Added a real `_serialize_nps_gauge` method and wired it in.
8. **`backend/analytics_module/src/ai/__init__.py`** (`AIGuard.wrap_call_async`) — two real concurrency/async bugs: (a) it decided whether to `await` a call by checking `inspect.iscoroutinefunction(func)`, which misses `AsyncMock`-style callables and returns an **unawaited coroutine** instead of a result; fixed by awaiting based on the actual call result's awaitability instead. (b) the concurrency-limiting semaphore was a bare class-level singleton bound to whichever event loop first created it — reusing it under a different loop raises "Future attached to a different loop." Fixed by recreating the semaphore whenever the running loop changes.
9. **`backend/tests/capture_auth/conftest.py`** — this conftest stubbed `sys.modules["slowapi"]` with a `MagicMock` whenever "nothing has imported slowapi yet in this process" — not "slowapi isn't installed." When this conftest loaded before any real slowapi import (alphabetical collection order), it **permanently corrupted `sys.modules` for the rest of the pytest run**, breaking `backend/tests/voice_feedback/`'s real `from slowapi.middleware import SlowAPIMiddleware` for every test after it. This is what looked like "slowapi isn't installed" originally — it was actually installed fine; a sibling test file was silently poisoning the module cache. Fixed to only stub when the real import genuinely fails.
10. **`backend/routers/surveys.py`** (found during Phase 1-5, listed here for completeness) — `str | None` PEP 604 syntax needs Python 3.10+; your local venv runs 3.9, so this crashed the whole app import. Fixed with `Optional[str]`.
11. **Stale test assertions, not bugs** (production code was already correct — updated the tests to match reality): `test_product_test_public_gateway.py` / `test_public_product_test_gateway.py` asserted on an old docs filename (`DATA_LAYER.md`) that was renamed to `product-test-data-layer.md`; `test_pptx_admin_diagnostics.py` used a staleness fixture (1000s idle) shorter than the actual TTL (1800s); `test_target_gating.py` tested a phantom `AnalyticsService(db, config).get_target_status()` API that never existed — rewrote it to test the real `quota_enforcement.py` functions (and extracted a small `compute_target_reached()` helper so the logic in `responses.py` has something directly testable instead of an inline boolean expression); `test_pptx_export.py` asserted the wrong slide index for a section divider, not accounting for the always-inserted Strategic Narrative slide; `test_product_test_phase5_qa.py` expected older, less-specific rejection-reason wording than what the app now returns (verified via its passing sibling test in `test_public_followup.py` that the current wording is correct).

**What's still not fixable here (environment, not code):** the 4 MongoDB-Atlas-network-dependent backend tests, and the 2 optional-ML-dependency test files. Both need to run somewhere with real DB network access / the extra ML packages installed — most likely your actual dev machine or CI, or inside Docker.

## Files changed this session

**New files**: `frontend/src/hooks/useSurveyDirection.ts(+.test.ts)`, `frontend/src/pages/PublicSurvey/WelcomeScreen.tsx(+.test.tsx)`, `frontend/src/components/voice-feedback/FollowUpRoundsSlider.tsx(+.test.tsx)`, `frontend/public/fonts/Cairo-*.woff2` (4 files), this notes file.

**Modified (Phase 1-5)**: `frontend/src/types/surveyFlow.ts`, `frontend/src/pages/PublicSurvey.tsx`, `frontend/src/pages/MasterLinkRedirect.tsx`, `frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/src/components/Layout.tsx`, `frontend/src/components/report/ChartRenderer.tsx`, `frontend/src/pages/SurveyReport.tsx`, `frontend/src/components/voice-feedback/AiFollowUpPanel.tsx`, `frontend/src/hooks/useFollowUpOrchestration.ts`, `frontend/src/components/taste-test-respondent/TasteTestOpenEndQuestion.tsx`, `backend/analytics_module/aggregator.py`, `backend/voice_feedback/nlp_prompts/smart_followup.json`, `backend/resources/analytics/prompts/executive_summary.json`, `backend/routers/surveys.py`.

**Modified (Round 2 — bug fixes)**: `frontend/src/utils/productTestPlaceholderEngine.ts`, `frontend/src/components/respondent/HorizontalScaleSlider.tsx`, `backend/models.py`, `backend/analytics_module/pptx_builder/hybrid_export/render_mode.py`, `backend/analytics_module/web_serializer.py`, `backend/analytics_module/src/ai/__init__.py`, `backend/services/quota_enforcement.py`, `backend/routers/responses.py`, plus test files: `frontend/src/utils/moduleSequencePermutations.test.ts`, `frontend/src/utils/packagingHeatmapSnapshot.test.ts`, `backend/tests/capture_auth/conftest.py`, `backend/tests/analytics/test_pptx_export.py`, `backend/tests/analytics/test_target_gating.py`, `backend/tests/test_pptx_admin_diagnostics.py`, `backend/tests/test_product_test_phase5_qa.py`, `backend/tests/test_product_test_public_gateway.py`, `backend/tests/test_public_product_test_gateway.py`.

(This is on top of your own pre-existing uncommitted edits to `ChartRenderer.tsx`, `ScatterPlot.tsx`, `SuccessModal.tsx`, `IdentityStep.tsx`, `Dashboard.tsx`, `api.ts` from before this session — those are untouched except where noted above.)

## Recommended next pass (not started)

1. Page-by-page color/spacing consistency sweep (Surveys, Templates, Responses, Reports) + the survey font-size bump — best done live, looking at the running app together.
2. Wire the rounds slider into `PackagingHeatmapQuestion.tsx` and `ProductTestQuestionRenderer.tsx` (same 3-line pattern already proven in `TasteTestOpenEndQuestion.tsx`).
3. Regenerate a real report and visually confirm the Appraisal chart now renders — if it still doesn't, check backend logs (now with full tracebacks) for the exact failure.
4. Cross-question AI context (what the respondent said on other questions) — needs new backend data-fetching, scoped out of this pass.
5. Confirm the `brand.navy` hex values against your actual brand guide/screenshot.
6. The ~40 pre-existing `tsc --noEmit` type errors (listed in Round 2's test-results section) — a separate, real cleanup pass across ~15 files.
7. Run the 4 MongoDB-dependent backend tests and the 2 ML-dependency tests somewhere with real connectivity/packages, to confirm they pass outside this sandbox.

## How to test everything locally (commands)

**Frontend — full test suite:**
```powershell
cd frontend
npm install                 # first time only, or after pulling dependency changes
npm run test                # runs the full vitest suite — should print 555 passed, 73 files
npx tsc --noEmit             # type-check (pre-existing errors unrelated to this session will still show — see notes above)
```

**Frontend — run the app and look at what changed:**
```powershell
cd frontend
npm run dev                  # http://localhost:5173
```
Then in the browser: open a survey link (`/s/<token>`) fresh (clear localStorage/sessionStorage or use a private window) to see the new welcome screen — try it once with an Arabic-language survey and once with English, and at a narrow (mobile) browser width. Toggle dark/light mode on `/dashboard` and `/surveys` to see the navy sidebar. Open a survey report page to check the "Appraisal" section and the new driver-ranking chart.

**Backend — full test suite:**
```powershell
cd ..\backend  # or use the repo-root venv directly, as below
..\venv\Scripts\python.exe -m pytest backend/tests/ -q --ignore=backend/tests/voice_feedback/test_clustering_geometry.py --ignore=backend/tests/voice_feedback/test_semantic_precision.py
```
(Run from the repo root, not inside `backend/`, since the venv and `pytest.ini` expect that.) This should print **772 passed, 9 skipped, 4 failed** — the 4 failures are the MongoDB-Atlas-network ones described above; they're expected to fail in this sandbox and should be re-checked wherever you have real DB access.

If `pytest`/`pytest-cov` aren't installed in your venv yet:
```powershell
.\venv\Scripts\python.exe -m pip install pytest pytest-asyncio pytest-cov
```

**Backend — run the app:**
```powershell
cp .env.example .env         # first time only — fill in real MongoDB/Redis/SECRET_KEY
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8081
```
API docs at http://localhost:8081/docs.

**Full stack via Docker** (matches production more closely):
```powershell
cd infra/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
docker compose logs -f backend    # tail one service
docker compose down               # stop everything
```

## Git / Docker / AWS — how to proceed from here

Nothing has been committed. When you're ready:
```powershell
git status                      # review everything above
git add <specific files>        # avoid `git add .` — review first
git commit -m "..."
git push origin main
```
AWS deploy commands are unchanged from what's in the approved plan file and your own described workflow — see `C:\Users\User\.claude\plans\act-as-a-senior-ancient-glacier.md` for the full reference section (EC2 SSH/pull/rebuild steps).
