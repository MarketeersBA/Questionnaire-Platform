from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.responses import StreamingResponse

from backend.models import (
    ModuleQuestion,
    QuestionModule,
    QuestionModuleCreate,
    QuestionModuleSummary,
    QuestionModuleUpdate,
    User,
)
from backend.routers.auth import get_current_active_analyst, get_current_user
from backend.services.question_module_service import question_module_service
from backend.utils.module_rollout_flags import get_module_rollout_payload

router = APIRouter(prefix="/modules", tags=["question-modules"])


@router.get("/rollout")
async def get_module_rollout(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Phase 9 rollout stage and enabled capabilities."""
    return get_module_rollout_payload()


@router.get("/", response_model=List[QuestionModuleSummary])
async def list_modules(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """List active question modules (metadata only, latest version per module_id)."""
    return await question_module_service.list_active_summaries()


# NOTE: every literal path below must be declared BEFORE the
# "/{module_id}" routes. FastAPI matches in declaration order, so a
# literal registered after the catch-all is swallowed by it and answers
# 404 "Module not found" instead of running. That is exactly how the
# template download broke.
@router.get("/excel-template")
async def download_excel_template(
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """
    Download the .xlsx template for module import.

    Generated from MODULE_TEMPLATE_COLUMNS so the file can never drift out of
    sync with what parse_excel actually reads.
    """
    import io

    import pandas as pd

    sample_rows = [
        {
            "Question EN": "How sweet did you find it?",
            "Question AR": "ما مدى حلاوته؟",
            "Question Type": "linear_scale",
            "Attribute": "Taste",
            "Sub Attribute": "Sweetness",
            "Scale Type": "jar",
            "Scale Min": 1,
            "Scale Max": 5,
        },
        {
            "Question EN": "How would you rate the overall taste?",
            "Question AR": "كيف تقيم الطعم بشكل عام؟",
            "Question Type": "linear_scale",
            "Attribute": "Taste",
            "Sub Attribute": "Overall",
            "Scale Type": "linear",
            "Scale Min": 1,
            "Scale Max": 7,
        },
        {
            "Question EN": "What would you improve about the packaging?",
            "Question AR": "ما الذي تريد تحسينه في العلبة؟",
            "Question Type": "text",
            "Attribute": "Packaging",
            "Sub Attribute": "Improvements",
            "Scale Type": "",
            "Scale Min": "",
            "Scale Max": "",
        },
        {
            "Question EN": "Which package design appeals most?",
            "Question AR": "أي تصميم للعلبة يجذبك أكثر؟",
            "Question Type": "single",
            "Attribute": "Packaging",
            "Sub Attribute": "",
            "Scale Type": "",
            "Scale Min": "",
            "Scale Max": "",
        },
    ]

    df = pd.DataFrame(sample_rows, columns=MODULE_TEMPLATE_COLUMNS)

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Module")

        # Widen the columns so the template is readable the moment it opens.
        sheet = writer.sheets["Module"]
        for idx, column in enumerate(MODULE_TEMPLATE_COLUMNS, start=1):
            longest = max([len(column)] + [
                len(str(row.get(column, ""))) for row in sample_rows
            ])
            sheet.column_dimensions[
                sheet.cell(row=1, column=idx).column_letter
            ].width = min(52, max(14, longest + 4))

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="module_template.xlsx"'
        },
    )


@router.get("/{module_id}", response_model=QuestionModule)
async def get_module(
    module_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Full module definition — latest active version."""
    doc = await question_module_service.get_active_module(module_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active module '{module_id}' not found",
        )
    return doc


@router.get("/{module_id}/questions", response_model=List[ModuleQuestion])
async def get_module_questions(
    module_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Flat question list for a module (section order → question order)."""
    doc = await question_module_service.get_active_module(module_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active module '{module_id}' not found",
        )
    flat = await question_module_service.get_active_questions_flat(module_id)
    return [
        {k: v for k, v in q.items() if not k.startswith("section_")}
        for q in flat
    ]


@router.post("/", response_model=QuestionModule)
async def create_module(
    payload: QuestionModuleCreate,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Create a completely new custom module."""
    import uuid
    # Generate a unique module_id
    base_id = payload.name.lower().replace(" ", "_")
    base_id = "".join(c for c in base_id if c.isalnum() or c == "_")
    module_id = f"custom_{base_id}_{str(uuid.uuid4())[:6]}"
    
    doc = await question_module_service.create_initial_module(
        module_id,
        payload,
        username=current_user.username,
    )
    return doc

#  Excel import
#
#  Sheet contract (one question per row), mirrored by MODULE_TEMPLATE_COLUMNS
#  and by the instructions the builder shows before upload:
#
#    Question EN | Question AR | Question Type | Attribute | Sub Attribute
#    | Options EN | Options AR | Scale Min | Scale Max
#
#  Attribute is what groups rows: every distinct value becomes one section
#  (= one main research attribute), preserving first-seen order. Sub Attribute
#  is optional and lands on the individual question. Options / Scale columns
#  only apply to the question types that use them.

MODULE_TEMPLATE_COLUMNS = [
    "Question EN",
    "Question AR",
    "Question Type",
    "Attribute",
    "Sub Attribute",
    "Scale Type",
    "Scale Min",
    "Scale Max",
]

# Read when present but deliberately absent from the template: choice options
# are authored in the studio, not the sheet. Sheets that still carry these
# columns keep importing rather than silently losing their options.
_LEGACY_OPTION_COLUMNS = ["Options EN", "Options AR"]

# Accepted spellings for the Scale Type column.
_SCALE_VARIANTS = {
    "jar": ("jar", "just about right", "just-about-right", "sensory"),
    "bipolar": ("bipolar", "opposed", "semantic"),
    "linear": ("linear", "intensity", "standard", "normal"),
}

# Accepted spellings for each question type. Matched as substrings against the
# lowercased cell so "Multiple Choice", "choice", and "mcq" all land on mcq.
_TYPE_SYNONYMS = [
    ("linear_scale", ("linear", "scale", "slider", "rating")),
    ("mcq", ("choice", "mcq", "multi", "multiple")),
    ("scq", ("single", "scq", "radio", "one")),
    ("open_loop", ("loop", "list", "repeat")),
    ("open_single", ("text", "open", "free")),
]

_DEFAULT_ATTRIBUTE = "General"


def _cell(row, column: str) -> str:
    """Read a cell as a clean string, treating NaN/None/'nan' as empty."""
    import pandas as pd

    raw = row.get(column)
    if raw is None or (not isinstance(raw, str) and pd.isna(raw)):
        return ""
    text = str(raw).strip()
    return "" if text.lower() in {"nan", "none", "nat"} else text


def _resolve_question_type(raw: str) -> str:
    """Map a free-text Question Type cell onto a valid QuestionType."""
    probe = raw.strip().lower()
    if not probe:
        return "open_single"
    for canonical, needles in _TYPE_SYNONYMS:
        if probe == canonical or any(needle in probe for needle in needles):
            return canonical
    return "open_single"


def _split_options(opts_en_raw: str, opts_ar_raw: str) -> list[dict]:
    """Split the comma-separated option columns into QuestionOption dicts."""
    opts_en = [o.strip() for o in opts_en_raw.split(",") if o.strip()]
    opts_ar = [o.strip() for o in opts_ar_raw.split(",") if o.strip()]

    options: list[dict] = []
    for i, label_en in enumerate(opts_en):
        options.append({
            # Stable analytics slug; the labels are display-only.
            "value": f"opt_{i + 1}",
            "en_label": label_en,
            "ar_label": opts_ar[i] if i < len(opts_ar) else "",
            "order": i,
        })
    return options


def _resolve_scale_variant(raw: str) -> str:
    """Map a free-text Scale Type cell onto a valid ScaleAnchorVariant."""
    probe = raw.strip().lower()
    if not probe:
        return "linear"
    for canonical, needles in _SCALE_VARIANTS.items():
        if any(needle in probe for needle in needles):
            return canonical
    return "linear"


def _scale_bounds(row) -> tuple[int, int]:
    """Read Scale Min/Max, falling back to a 1-5 scale when absent or invalid."""
    def as_int(column: str, fallback: int) -> int:
        text = _cell(row, column)
        if not text:
            return fallback
        try:
            return int(float(text))
        except (TypeError, ValueError):
            return fallback

    lo = as_int("Scale Min", 1)
    hi = as_int("Scale Max", 5)
    # The model rejects an inverted or degenerate range, so repair it here
    # rather than failing the whole import over one malformed cell.
    if hi <= lo:
        lo, hi = 1, 5
    return lo, hi


@router.post("/parse-excel", response_model=QuestionModuleCreate)
async def parse_excel(
    current_user: Annotated[User, Depends(get_current_active_analyst)],
    file: UploadFile = File(...),
):
    """Parse an uploaded Excel file into a draft QuestionModuleCreate payload."""
    import io

    import pandas as pd

    if not (file.filename or "").lower().endswith((".xls", ".xlsx")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an .xlsx or .xls file.",
        )

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not read the Excel file: {exc}"
        )

    # Tolerate case and spacing differences in the header row.
    df.columns = [str(c).strip() for c in df.columns]
    lookup = {c.lower(): c for c in df.columns}
    df = df.rename(columns={
        lookup[expected.lower()]: expected
        for expected in MODULE_TEMPLATE_COLUMNS + _LEGACY_OPTION_COLUMNS
        if expected.lower() in lookup
    })

    # An Arabic-only sheet is legitimate, so either question column satisfies
    # this; requiring 'Question EN' specifically would reject those outright.
    if not {"Question EN", "Question AR"} & set(df.columns):
        raise HTTPException(
            status_code=422,
            detail=(
                "The sheet needs a 'Question EN' or 'Question AR' column. "
                f"Expected columns: {', '.join(MODULE_TEMPLATE_COLUMNS)}."
            ),
        )

    # Preserve first-seen attribute order so the builder shows the attributes
    # in the same order the analyst wrote them.
    sections: list[dict] = []
    section_by_attribute: dict[str, dict] = {}
    question_no = 0

    for _, row in df.iterrows():
        q_en = _cell(row, "Question EN")
        q_ar = _cell(row, "Question AR")
        if not q_en and not q_ar:
            continue  # blank spacer row

        q_type = _resolve_question_type(_cell(row, "Question Type"))
        attribute = _cell(row, "Attribute") or _DEFAULT_ATTRIBUTE

        section = section_by_attribute.get(attribute.lower())
        if section is None:
            section = {
                "section_id": f"attr_{len(sections) + 1}",
                "title_en": attribute,
                "title_ar": attribute,
                "order": len(sections),
                "questions": [],
            }
            sections.append(section)
            section_by_attribute[attribute.lower()] = section

        question_no += 1
        question = {
            # Must satisfy ModuleQuestion's ^[a-z]{2}_q\d+$ pattern.
            "question_id": f"cm_q{question_no}",
            "label": q_en or q_ar,
            "type": q_type,
            "en_text": q_en,
            "ar_text": q_ar,
            "order": len(section["questions"]),
            "sub_attribute": _cell(row, "Sub Attribute") or None,
            "options": [],
        }

        if q_type in {"mcq", "scq"}:
            # Only populated when a legacy sheet still carries the option
            # columns; otherwise the analyst adds options in the studio.
            question["options"] = _split_options(
                _cell(row, "Options EN"), _cell(row, "Options AR")
            )
        elif q_type == "linear_scale":
            variant = _resolve_scale_variant(_cell(row, "Scale Type"))
            question["scale_variant"] = variant
            if variant == "jar":
                # JAR anchors are fixed at 1 / 3 / 5; the model rejects
                # anything else, so normalise rather than fail the import.
                question["scale_min"], question["scale_max"] = 1, 5
            else:
                question["scale_min"], question["scale_max"] = _scale_bounds(row)

        section["questions"].append(question)

    if not sections:
        raise HTTPException(
            status_code=422,
            detail="No questions found. Every row needs text in 'Question EN' or 'Question AR'.",
        )

    module_name = (file.filename or "module").rsplit(".", 1)[0].replace("_", " ").title()

    return {
        "name": module_name,
        "description": "Imported from Excel",
        "sections": sections,
    }

@router.put("/{module_id}", response_model=QuestionModule)
async def update_module(
    module_id: str,
    payload: QuestionModuleUpdate,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """
    Analyst update — validates payload, deactivates prior version, inserts new version.
    """
    if not module_id.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid module_id format")

    try:
        doc = await question_module_service.upsert_module_version(
            module_id,
            payload,
            username=current_user.username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return doc
