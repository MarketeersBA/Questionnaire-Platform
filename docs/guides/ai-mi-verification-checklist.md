# AI/MI (Smart Follow-up) — Manual Verification Checklist

Use this checklist after deploying or changing the Smart Follow-up Engine on **taste test** and **product test** surveys.

## Prerequisites

- [ ] Backend running with `OPENAI_API_KEY` set in `.env`
- [ ] Frontend dev server running
- [ ] Voice capture enabled on the survey if testing recordings

---

## 1. Create Survey setup

- [ ] Create a **taste test** survey
- [ ] Open **Parameters** → enable **Smart Follow-up Engine (AI / MI)**
- [ ] Enable **Text** channel
- [ ] Enable **Voice** channel (if testing recordings)
- [ ] Publish / save the survey and open a respondent link

---

## 2. Reach an eligible L2 open-end

- [ ] Complete Layer 1 and navigate to **Layer 2**
- [ ] Find an open-ended question with **like**, **dislike**, or **recommend** wording  
  (e.g. “What did you like about the taste?”)
- [ ] Confirm the question is **open-ended**, not a scale

---

## 3. Text follow-up (round 1)

- [ ] Type an answer with **5+ characters**
- [ ] **Blur** the field (tab out or click elsewhere)
- [ ] In browser DevTools → Network, confirm `POST /public/{token}/followup` fires
- [ ] Confirm **AiFollowUpPanel** appears with a probe question
- [ ] Confirm the primary answer remains in `l2Answers` (not replaced)

---

## 4. Text reply (round 2+)

- [ ] Reply in the follow-up panel with another **5+ character** answer
- [ ] Confirm a second `POST /followup` fires with `current_round: 2`
- [ ] Confirm behavior respects **max_rounds** (panel closes or no new probe after cap)
- [ ] Inspect stored answer text — should contain appended blocks:

```
AI Follow-up: ...
Respondent: ...
```

---

## 5. Voice follow-up

- [ ] On an eligible open-end, record a voice answer (or reply by voice in the panel)
- [ ] Confirm recording saves (toast: “Recording saved”)
- [ ] Confirm polling hits `GET /public/{token}/voice-status/{feedback_id}`
- [ ] When transcript is ready, confirm follow-up panel appears or advances
- [ ] Voice reply placeholder `[Audio Answer]` appears in appended text if applicable

---

## 6. Category disable (likes)

- [ ] In Create Survey → **Advanced AI/MI Controls** → disable **likes** category
- [ ] Re-open respondent link on a **like** open-end
- [ ] Blur with 5+ chars — **no** follow-up panel, **no** `/followup` probe (or `action: complete`)
- [ ] **Dislike** / **recommend** questions still trigger when enabled

---

## 7. Product test regression

- [ ] Open a **product test** survey with AI/MI enabled
- [ ] Confirm open-ended like/dislike/recommend questions still show follow-up
- [ ] Confirm heatmap follow-up still works if heatmap surfaces are enabled in advanced config

---

## 8. Submission & persistence

- [ ] Refresh mid-survey — primary answers and `aiInsights` restore from session
- [ ] Submit survey — response document contains `__structured.ai_insights`
- [ ] Open-end text in submission includes `AI Follow-up:` blocks when exchanges occurred
- [ ] `voice_feedbacks` collection has turn rows with `round`, `followup_text`, `answer_text`

---

## 9. Failure paths (optional)

- [ ] Temporarily remove `OPENAI_API_KEY` — infra toast appears, answer still saved, survey completable
- [ ] Voice transcription failure — toast appears, survey not blocked

---

## Sign-off

| Check | Tester | Date |
|-------|--------|------|
| Taste test text + voice follow-up | | |
| Category disable | | |
| Product test unchanged | | |
| Submit / analytics shape | | |
