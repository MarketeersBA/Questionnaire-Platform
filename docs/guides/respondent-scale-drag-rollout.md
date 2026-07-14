# Respondent Scale Drag: QA and Rollout

## Scope

This rollout applies to respondent linear scale questions rendered through `HorizontalScaleSlider` in:

- `frontend/src/pages/PublicSurvey.tsx`
- `frontend/src/components/product-test-respondent/ProductTestQuestionRenderer.tsx`

No backend changes are required.

## Automated Coverage

- `frontend/src/utils/horizontalScaleMath.test.ts` — pure math and snapping
- `frontend/src/utils/horizontalScaleDragMachine.test.ts` — pointer state transitions
- `frontend/src/components/respondent/HorizontalScaleSlider.test.tsx` — drag/tap interaction, value commit path, body scroll lock
- `frontend/src/components/product-test-respondent/ProductTestQuestionRenderer.test.tsx` — scale renderer uses shared slider and commits `onChange`
- `frontend/tests/e2e/respondent_scale_drag.spec.ts` — mobile token flow with drag, track tap, and session persistence verification

## Manual QA Checklist

- iOS Safari and Android Chrome:
  - Drag thumb left/right updates value correctly
  - Tap track center jumps to expected midpoint
  - Page does not scroll while dragging
- Arabic survey (`language: 'ar'`):
  - Labels remain readable and correctly RTL
  - Drag geometry remains LTR (min left, max right)
- Dark mode:
  - Thumb border and fill remain visible and high-contrast
- Accessibility:
  - VoiceOver/TalkBack announces range label and value changes
  - Keyboard step changes via range input still function
- Product test compatibility:
  - No regression in packaging heatmap interactions (`touch-action: none`) on the same flow

## Rollout Strategy

- Ship as a frontend-only enhancement.
- Keep quick rollback via env toggle:
  - `VITE_ENABLE_SCALE_DRAG=false` disables pointer drag/tap behavior and leaves native range interaction active.
  - Default behavior (flag unset) is enabled.
- Recommended rollout:
  1. Deploy to staging with default enabled.
  2. Run mobile smoke checks on at least one iOS and one Android device.
  3. Monitor respondent completion and validation failure rates for first 24 hours.
  4. If needed, disable drag behavior using env flag without backend deployment.
