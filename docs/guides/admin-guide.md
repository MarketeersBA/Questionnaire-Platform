# Admin Guide

> **Audience:** Platform admins and research operations leads.  
> **Purpose:** Step-by-step guide to templates, surveys, tokens, response monitoring, and reports — no code required.  
> **Prerequisites:** Portal login with **admin** role.  
> **Related:** [stakeholder-map.md](../handover/stakeholder-map.md) · [survey-lifecycle.md](survey-lifecycle.md) · [glossary.md](../handover/glossary.md)

---

## Before You Begin

| Item | Detail |
|------|--------|
| **Login URL** | Your deployment URL (e.g. `https://your-domain.com` or `http://localhost:5173` in dev) |
| **Credentials** | Provided by your team — dev default is in [local-development.md](../technical/local-development.md) |
| **Role** | You must have `admin` role for user management and admin-only pages |

---

## Portal Navigation (Admin)

As an admin, you have access to all analyst features **plus**:

| Page | Path | Purpose |
|------|------|---------|
| Dashboard | `/dashboard` | Overview and quick actions |
| Templates | `/templates` | Manage survey blueprints |
| Surveys | `/surveys` | List and manage live studies |
| Create Survey | `/create-survey` | Launch new study wizard |
| Survey Reports | `/surveys/reports` | Browse generated reports |
| Tokens | Via survey detail | Generate and manage token batches |
| Responses | Via survey detail | Monitor respondent lifecycle |
| User Management | `/user-management` | Create/manage portal users |
| Platform Analytics | `/admin/analytics` | Cross-study platform metrics |
| AI Telemetry | `/admin/ai-telemetry` | AI usage and cost visibility |
| Attribute Banks | `/admin/attributes` | Sensory attribute libraries |

---

## Workflow 1: Create a Template (Blueprint)

Templates are the foundation. Create them once; reuse across many surveys.

### Steps
1. Go to **Templates** (`/templates`).
2. Click to create a new template (or duplicate an existing one).
3. Configure:
   - **Name** and **study type** (taste test, product test, etc.)
   - **Layer 1 structure** — screening questions (name, phone, age, gender, area, etc.)
   - **Layer 2 structure** — evaluation questions, brand blocks, modules
   - **Screening validation** — correct answers, required fields
4. Save. The system assigns a **version number**.

### Best practices
- Use clear naming: `ProductTest_IHUT_v2`, not `Survey1`.
- Document screening intent in the template name or internal notes.
- Avoid editing a template mid-fieldwork for an active survey — active surveys use a **snapshot** from creation time.

### Versioning
When you update a template, a new version is created. Existing surveys keep their original snapshot. New surveys can pick the latest version.

---

## Workflow 2: Create a Survey

A survey is a live study instance ready for fieldwork.

### Steps
1. Go to **Create Survey** (`/create-survey`).
2. **Select a template** (and version if prompted).
3. Configure study parameters:
   - **Company / client name**
   - **Brands** (client brand + competitors)
   - **Category** and study-specific settings
   - **Screening gates** — age ranges, gender, area, education, marital status, SES
   - **Quotas** — global cap and per-cell limits
4. **Layer 2 delivery:**
   - **In-app gateway (recommended)** — respondents complete evaluation inside Questioner
   - **Google Forms (legacy)** — paste Google Form URL and Form ID; requires Apps Script setup (see [webhooks-and-integrations.md](../api/webhooks-and-integrations.md))
5. For **Product Test** surveys: ensure question banks are seeded first (see [product-test-data-layer.md](../data/product-test-data-layer.md)).
6. Review the structural blueprint preview.
7. Save. Survey is typically created in **draft** status until you activate fieldwork.

### Checklist before going live
- [ ] Screening gates match client brief
- [ ] Quota sizes are realistic for recruitment plan
- [ ] Brand list is correct (spelling, competitor set)
- [ ] Layer 2 path is configured and tested
- [ ] Product Test banks seeded (if applicable)

---

## Workflow 3: Generate Tokens

Tokens are unique links for respondents.

### Steps
1. Open the survey from **Surveys** (`/surveys`).
2. Navigate to **Token Management** (or tokens section on survey detail).
3. Enter **count** (e.g. 500 for Wave 1).
4. Click **Generate**.
5. Copy links or export the batch. Each link format: `https://your-domain.com/s/{token-uuid}`

### Token properties
| Property | Typical value |
|----------|---------------|
| Initial status | `unused` |
| Expiry | Often ~30 days from generation (configurable) |
| Batch ID | Groups tokens from one generation run |

### Distribution
- Send links through your recruitment channel (SMS, panel, intercept).
- Instruct respondents **not to share** links — one token = one journey.
- Keep a batch log (which agency got which batch) for troubleshooting.

---

## Workflow 4: Monitor Responses

Track fieldwork quality in real time.

### Access
Open the survey → **Responses** or **Survey Responses** (`/surveys/:surveyId/responses`).

### Lifecycle filters

| Filter | Token status | Meaning |
|--------|--------------|---------|
| **Pending** | `unused` | Link issued but Layer 1 not completed |
| **Verified incomplete** | `passed` | Passed screening; Layer 2 not finished |
| **Verified complete** | `submitted` | Full journey complete |
| **Rejected** | `failed` | Failed screening or quota |
| **Excluded** | Any + excluded flag | Removed from reporting |

### What to watch during fieldwork
| Signal | Action |
|--------|--------|
| High rejection rate | Review screening gates — too strict? |
| Many `passed` but not `submitted` | Layer 2 dropout — check length, mobile UX, or follow up |
| Quota cells filling unevenly | Adjust recruitment targeting |
| Orphan submissions (if using Google Forms) | Check webhook and token field integrity |

### Respondent detail
Click a respondent to see:
- Timeline (token created → L1 submitted → L2 submitted)
- Layer 1 and Layer 2 answers
- Rejection reason (if failed)

---

## Workflow 5: View and Generate Reports

### Browse reports
1. Go to **Survey Reports** (`/surveys/reports`) or open report from survey detail.
2. Select a survey with completed responses.
3. Open **Survey Report** (`/surveys/:surveyId/report`).

### Generate or refresh a report
1. From the survey or report page, trigger **Generate Report** (wording may vary in UI).
2. Wait for processing — analytics pipeline ingests responses, computes statistics, and optionally calls AI for narratives.
3. Refresh when status shows complete.

### Report contents (typical)
- Demographic breakdowns
- Brand comparison charts
- Purchase funnel visualizations
- AI chart insights and executive summary
- Download options (PPTX where enabled)

### PPTX export
- Request export from the report UI.
- Export runs as a **background job** — may take minutes for large studies.
- Download when ready. If stuck, escalate to operator (Redis queue / worker).

---

## Workflow 6: User Management (Admin Only)

### Steps
1. Go to **User Management** (`/user-management`).
2. Create users with appropriate **role**:
   - `admin` — full access
   - `analyst` — studies and reports, no user management
   - `client` — limited read access
3. Deactivate users who leave the project (`is_active`).

### Security practices
- Change default dev credentials before production.
- Use strong passwords; rotate periodically.
- Grant **analyst** role by default for research staff; reserve **admin** for operations leads.

---

## Workflow 7: Attribute Banks (Admin Only)

For taste and sensory studies:

1. Go to **Attribute Banks** (`/admin/attributes`).
2. Manage category-specific attribute libraries (e.g. beverage, snack).
3. Attributes appear in taste test configuration during survey creation.

---

## Common Admin Tasks

| Task | Where |
|------|-------|
| Duplicate a successful study setup | Create new survey from same template |
| Pause fieldwork | Stop distributing new tokens; existing links may still work until expiry |
| Investigate bad data | Respondent detail + exclusion if needed |
| Compare two surveys | Comparison analytics (`/analytics/compare`) — analyst or admin |
| Check AI usage/cost | AI Telemetry (`/admin/ai-telemetry`) |

---

## Troubleshooting (Admin)

| Problem | Likely cause | What to do |
|---------|--------------|------------|
| Cannot log in | Wrong credentials or inactive user | Reset password; check user management |
| Product Test blueprint empty | Question bank not seeded | Run seed script — see [product-test-data-layer.md](../data/product-test-data-layer.md) |
| No respondents showing | Wrong survey selected or no tokens used | Verify batch was distributed |
| Report empty | No `submitted` responses yet | Wait for fieldwork or check lifecycle filters |
| Google Form responses missing | Webhook failure | Check Apps Script, ngrok/URL, orphan log — escalate to developer |
| PPTX never completes | Worker queue issue | Escalate to operator |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [analyst-guide.md](analyst-guide.md) | Deeper reporting and export workflows |
| [survey-lifecycle.md](survey-lifecycle.md) | End-to-end study timeline |
| [respondent-flow.md](respondent-flow.md) | What respondents experience |
| [local-development.md](../technical/local-development.md) | Local setup and Google Forms |

---

*Part of the Questioner documentation handover — [docs/README.md](../README.md)*
