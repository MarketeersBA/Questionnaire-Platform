from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict, field_validator, model_validator
from typing import List, Optional, Dict, Any, Annotated, Literal
from datetime import datetime
from bson import ObjectId

# Custom type for ObjectId
PyObjectId = Annotated[str, BeforeValidator(str)]


class MongoBaseModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )


# Shared Config Models
class BrandMetadata(BaseModel):
    name: str
    role: str = "competitor"  # internal, competitor
    is_pf_aided: bool = False


class ScreeningConfig(BaseModel):
    full_name: bool = True
    gender: bool = True
    age: bool = True
    location: bool = True
    education: bool = True
    marital_status: bool = True
    family_income: bool = True
    occupation: bool = True
    ses_screening: bool = False
    # Age gate
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    allowed_age_ranges: List[str] = Field(default_factory=list)
    # Gender gate
    allowed_genders: List[str] = Field(default_factory=list)
    # Area gate
    allowed_areas: List[str] = Field(default_factory=list)
    area_mode: str = "mcq"  # "mcq" | "free_text"
    # Education gate
    allowed_education: List[str] = Field(default_factory=list)
    # Marital status gate
    allowed_marital_status: List[str] = Field(default_factory=list)
    # SES gate
    allowed_ses: List[str] = Field(default_factory=list)


class BrandAnalyzerConfig(BaseModel):
    is_enabled: bool = False
    sync_with_purchase_funnel: bool = True  # Auto-links Awareness L4 -> L7
    selected_attributes: List[str] = Field(default_factory=list)  # linked to Attribute Bank
    brand_list: List[BrandMetadata] = Field(default_factory=list)  # if not syncing with PF


# Template Models
class TemplateBase(BaseModel):
    name: str
    type: str  # e.g., "taste_test"
    version: int = 1
    is_deleted: bool = False
    layer1_question_schema: Dict[str, Any] = Field(default_factory=dict)  # JSON schema for answers
    layer1_questions: List[Dict[str, Any]] = Field(default_factory=list)  # UI definition for L1 questions
    layer1_structure: Dict[str, Any] = Field(default_factory=dict) # New structured L1
    layer2_structure: Dict[str, Any] = Field(default_factory=dict)
    layer3_structure: Optional[Dict[str, Any]] = None
    layer4_structure: Optional[Dict[str, Any]] = None
    layer5_structure: Optional[Dict[str, Any]] = None
    layer6_structure: Optional[Dict[str, Any]] = None
    industry: Optional[str] = None
    survey_objective: Optional[str] = None
    survey_objective_other: Optional[str] = None
    survey_code: Optional[str] = None
    sec_classes: List[str] = Field(default_factory=list)
    purchase_funnel: Optional[Dict[str, Any]] = None
    layer1_screening_config: Optional[ScreeningConfig] = Field(default_factory=ScreeningConfig)
    taste_test_config: Optional[Dict[str, Any]] = None
    template_type: Optional[str] = None # e.g., "taste_test", "standard"
    selected_modules: List[str] = Field(default_factory=list)
    module_sequence: List[str] = Field(default_factory=list)
    brand_analyzer: Optional[BrandAnalyzerConfig] = Field(default_factory=BrandAnalyzerConfig)


class TemplateCreate(TemplateBase):
    pass


class Template(TemplateBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)




class QuotaState(BaseModel):
    target: int = 0
    current: int = 0


class ResearchBlueprint(BaseModel):
    category: str = ""
    rating_scale: int = 10
    own_brand: Optional[str] = None
    brands: List[BrandMetadata] = Field(default_factory=list)
    attributes: Dict[str, List[str]] = Field(default_factory=dict)
    custom_research_attributes: List[Dict[str, Any]] = Field(default_factory=list)


# ── Product Test respondent snapshot (Phase 1 domain contract) ───────────────

ProductTestTimingPhase = Literal["before_use", "during_use", "after_use", "packaging"]
ProductTestRespondentModule = Literal["product_test", "package_test"]
ProductTestTestingProtocol = Literal["branded", "blind"]


class ProductTestBrandContext(BaseModel):
    """Brand evaluation context for per-brand product test loops."""
    brands: List[str] = Field(default_factory=list)
    own_brand: Optional[str] = None
    category: str = "Category"
    testing_protocol: ProductTestTestingProtocol = "branded"
    blind_codes: Dict[str, str] = Field(default_factory=dict)


class ProductTestRespondentQuestion(BaseModel):
    id: str
    text: str
    type: str
    options: List[str] = Field(default_factory=list)
    required: bool = True
    timing: ProductTestTimingPhase
    diagnostic_tag: Optional[str] = None
    questionMeta: Dict[str, Any] = Field(default_factory=dict)
    brand: Optional[str] = None
    displayBrand: Optional[str] = None
    canonicalQuestionId: Optional[str] = None


class ProductTestRespondentSection(BaseModel):
    id: str
    title: str
    module: ProductTestRespondentModule
    timing: ProductTestTimingPhase
    questions: List[ProductTestRespondentQuestion] = Field(default_factory=list)
    brand: Optional[str] = None
    displayBrand: Optional[str] = None


class ProductTestRespondentPhase(BaseModel):
    timing: ProductTestTimingPhase
    label: str
    sections: List[ProductTestRespondentSection] = Field(default_factory=list)


class ProductTestSnapshotMeta(BaseModel):
    totalQuestions: int = 0
    sectionCount: int = 0
    phaseCount: int = 0
    generatedAt: str = ""
    brandCount: int = 0
    questionsPerBrand: int = 0


class ProductTestSnapshot(BaseModel):
    """Immutable respondent payload stored on survey.product_test_snapshot."""
    version: Literal[1] = 1
    language: Literal["en", "ar"] = "en"
    phases: List[ProductTestRespondentPhase] = Field(default_factory=list)
    meta: ProductTestSnapshotMeta = Field(default_factory=ProductTestSnapshotMeta)
    brand_context: Optional[ProductTestBrandContext] = None


class AnalyticalMapping(BaseModel):
    """
    Survey-level analytical role → question ID mapping.
    Supports legacy tom/unaided/aided fields and module-native stage_roles.
    """
    tom: Optional[str] = None
    unaided: Optional[str] = None
    aided: Optional[str] = None
    ba_perception: Optional[str] = None
    ba_satisfaction: Optional[str] = None
    awareness_keys: Dict[str, str] = Field(
        default_factory=dict,
        description="Logical awareness roles → question_id (e.g. tom → pf_q1)",
    )
    stage_roles: Dict[str, str] = Field(
        default_factory=dict,
        description="Funnel stage roles → question_id (consideration, bought_12m, mou, ...)",
    )
    legacy_id_aliases: Dict[str, str] = Field(
        default_factory=dict,
        description="Legacy aw_/pb_* → pf_q* aliases for backward-compatible analytics",
    )
    brand_alias_map: Dict[str, str] = Field(default_factory=dict)
    brand_aliases: Dict[str, Any] = Field(default_factory=dict)


class SurveyToken(MongoBaseModel):
    survey_id: str
    token: str
    is_used: bool = False
    used_at: Optional[datetime] = None


# Survey Models
class Customization(BaseModel):
    brands: List[str] = []
    category: str = ""
    modified_questions: List[Dict[str, Any]] = []




class Layer1Rules(BaseModel):
    gender: Optional[str] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    extra_conditions: List[Dict[str, Any]] = []


class VoiceCaptureConfig(BaseModel):
    is_enabled: bool = False
    mode: str = "text_only"  # text_only | text_and_voice
    target_questions: str = "after_taste_open_ends"
    ai_analysis_enabled: bool = False
    transcription_language: str = "auto"  # auto | en | ar


class AiFollowupCategoryConfig(BaseModel):
    max_rounds: Optional[int] = Field(default=None, ge=1, le=3)
    enabled: bool = True


class AiFollowupConfig(BaseModel):
    """Smart Follow-up Engine settings for live AI probing of open-ended answers."""
    is_enabled: bool = False
    max_rounds: int = Field(default=2, ge=1, le=3)
    apply_to_voice: bool = True
    apply_to_text: bool = True
    custom_instructions: Optional[str] = Field(default=None, max_length=500)
    category_config: Dict[str, AiFollowupCategoryConfig] = Field(default_factory=dict)
    eligible_surfaces: Optional[List[str]] = None
    min_answer_length: int = Field(default=5, ge=1, le=100)
    dedupe_window_ms: int = Field(default=1000, ge=200, le=5000)


class SurveyBase(BaseModel):
    company_name: str
    template_id: str
    template_version: int
    template_snapshot_schema: Dict[str, Any]
    template_snapshot_questions: List[Dict[str, Any]]
    customizations: Customization
    layer1_rules: Layer1Rules
    google_form_id: str
    google_form_url: str
    survey_code: Optional[str] = None
    status: str = "draft" # draft, active, closed
    links_count: int = 1000
    sample_capacity: int = 200
    respondent_count: int = 0
    gate_quotas: Optional[Dict[str, Any]] = Field(default_factory=dict)
    gate_counts: Optional[Dict[str, Any]] = Field(default_factory=dict)
    quota_tracking: Optional[Dict[str, QuotaState]] = Field(default_factory=dict)
    internal_brands_data: List[BrandMetadata] = Field(default_factory=list)
    competitor_brands_data: List[BrandMetadata] = Field(default_factory=list)
    template_snapshot_l2: Optional[Dict[str, Any]] = None
    product_test_snapshot: Optional[Dict[str, Any]] = None
    generated_tokens: Optional[List[str]] = None
    is_deleted: bool = False
    layer1_screening_config: Optional[ScreeningConfig] = Field(default_factory=ScreeningConfig)
    purchase_funnel_id: Optional[str] = None
    voice_capture: Optional[VoiceCaptureConfig] = Field(default_factory=VoiceCaptureConfig)
    ai_followup: Optional[AiFollowupConfig] = Field(default_factory=AiFollowupConfig)
    selected_modules: List[str] = Field(default_factory=list)
    module_sequence: List[str] = Field(default_factory=list)
    module_snapshots: Dict[str, Any] = Field(
        default_factory=dict,
        description="Frozen question-module payloads keyed by module_id at survey creation",
    )

    @model_validator(mode='before')
    @classmethod
    def map_legacy_survey_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if 'respondent_target' in data and 'sample_capacity' not in data:
                data['sample_capacity'] = data.get('respondent_target', 200)
            if 'link_count' in data and 'links_count' not in data:
                data['links_count'] = data.get('link_count', 1000)
        return data
    analytical_mapping: Optional[Dict[str, Any]] = Field(default_factory=dict)
    taste_test_config: Optional[Dict[str, Any]] = None
    product_test_config: Optional[Dict[str, Any]] = None
    pf_config: Optional[Dict[str, Any]] = None
    purchase_funnel: Optional[Dict[str, Any]] = None
    brand_analyzer: Optional[BrandAnalyzerConfig] = Field(default_factory=BrandAnalyzerConfig)
    brand_usage: Optional[Dict[str, Any]] = None
    brand_pricing_behavior: Optional[Dict[str, Any]] = None
    blueprint: Optional[ResearchBlueprint] = None
    created_by: Optional[str] = None
    last_edited_by: Optional[str] = None
    type: Optional[str] = None
    industry: Optional[str] = None
    category: Optional[str] = None
    survey_objective: Optional[str] = None
    survey_objective_other: Optional[str] = None
    sec_classes: List[str] = Field(default_factory=list)


class SurveyCreate(BaseModel):
    company_name: str
    template_id: str
    customizations: Customization = Field(default_factory=Customization)
    layer1_rules: Layer1Rules = Field(default_factory=Layer1Rules)
    google_form_id: str
    google_form_url: str
    survey_code: str
    links_count: int = 1000
    sample_capacity: int = 200
    respondent_count: int = 0
    gate_quotas: Optional[Dict[str, Any]] = Field(default_factory=dict)
    gate_counts: Optional[Dict[str, Any]] = Field(default_factory=dict)
    internal_brands_data: List[BrandMetadata] = Field(default_factory=list)
    competitor_brands_data: List[BrandMetadata] = Field(default_factory=list)
    template_snapshot_schema: Optional[Dict[str, Any]] = None
    template_snapshot_questions: Optional[List[Dict[str, Any]]] = None
    template_snapshot_l2: Optional[Dict[str, Any]] = None
    product_test_snapshot: Optional[Dict[str, Any]] = None
    layer1_screening_config: Optional[ScreeningConfig] = Field(default_factory=ScreeningConfig)
    purchase_funnel_id: Optional[str] = None
    voice_capture: Optional[VoiceCaptureConfig] = Field(default_factory=VoiceCaptureConfig)
    ai_followup: Optional[AiFollowupConfig] = Field(default_factory=AiFollowupConfig)
    analytical_mapping: Optional[Dict[str, Any]] = Field(default_factory=dict)
    taste_test_config: Optional[Dict[str, Any]] = None
    product_test_config: Optional[Dict[str, Any]] = None
    pf_config: Optional[Dict[str, Any]] = None
    purchase_funnel: Optional[Dict[str, Any]] = None
    brand_analyzer: Optional[BrandAnalyzerConfig] = Field(default_factory=BrandAnalyzerConfig)
    brand_usage: Optional[Dict[str, Any]] = None
    brand_pricing_behavior: Optional[Dict[str, Any]] = None
    blueprint: Optional[ResearchBlueprint] = None
    quota_tracking: Optional[Dict[str, QuotaState]] = Field(default_factory=dict)
    created_by: Optional[str] = None
    type: Optional[str] = None
    industry: Optional[str] = None
    category: Optional[str] = None
    survey_objective: Optional[str] = None
    survey_objective_other: Optional[str] = None
    sec_classes: List[str] = Field(default_factory=list)
    selected_modules: List[str] = Field(default_factory=list)
    module_sequence: List[str] = Field(default_factory=list)
    module_snapshots: Dict[str, Any] = Field(default_factory=dict)


class SurveyUpdate(BaseModel):
    company_name: Optional[str] = None
    customizations: Optional[Customization] = None
    layer1_rules: Optional[Layer1Rules] = None
    layer1_screening_config: Optional[ScreeningConfig] = None
    google_form_id: Optional[str] = None
    google_form_url: Optional[str] = None
    status: Optional[str] = None # draft, active, closed
    is_deleted: Optional[bool] = None
    purchase_funnel_id: Optional[str] = None
    report_status: Optional[str] = None
    last_report_path: Optional[str] = None
    taste_test_config: Optional[Dict[str, Any]] = None
    product_test_config: Optional[Dict[str, Any]] = None
    product_test_snapshot: Optional[Dict[str, Any]] = None
    blueprint: Optional[ResearchBlueprint] = None
    quota_tracking: Optional[Dict[str, QuotaState]] = Field(default_factory=dict)
    created_by: Optional[str] = None
    last_edited_by: Optional[str] = None
    survey_code: Optional[str] = None
    type: Optional[str] = None
    industry: Optional[str] = None
    sec_classes: List[str] = Field(default_factory=list)
    selected_modules: Optional[List[str]] = None
    module_sequence: Optional[List[str]] = None
    purchase_funnel: Optional[Dict[str, Any]] = None
    brand_analyzer: Optional[BrandAnalyzerConfig] = None
    brand_usage: Optional[Dict[str, Any]] = None
    brand_pricing_behavior: Optional[Dict[str, Any]] = None
    voice_capture: Optional[VoiceCaptureConfig] = None
    ai_followup: Optional[AiFollowupConfig] = None


class Survey(SurveyBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)


# Token Models
class TokenBase(BaseModel):
    survey_id: str
    token: str
    phone: Optional[str] = None
    status: str = "unused"  # unused, passed, failed, submitted
    layer1_passed: bool = False
    batch_id: Optional[str] = None
    created_by: Optional[str] = None
    last_accessed: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class TokenCreate(BaseModel):
    survey_id: str
    count: int


class Token(TokenBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TokenBulkUpdate(BaseModel):
    token_ids: List[str]
    status: Optional[str] = None
    expires_at: Optional[datetime] = None


# Response Models
class ResponseBase(BaseModel):
    survey_id: str
    token: str
    phone: Optional[str] = None
    answers: Dict[str, Any]
    source: str = "layer2"  # layer1 or layer2


class Response(ResponseBase, MongoBaseModel):
    submitted_at: datetime = Field(default_factory=datetime.utcnow)


# User/Auth
class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    is_active: bool = True
    role: str = "client"  # admin, analyst, client

    @field_validator("email", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        if v == "":
            return None
        return v


class UserCreate(UserBase):
    password: str


class UserInDB(UserBase, MongoBaseModel):
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class User(UserBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class TokenData(BaseModel):
    username: Optional[str] = None


# Respondent/Client Models
class Respondent(MongoBaseModel):
    name: str
    phone: str  # Unique identifier
    email: Optional[EmailStr] = None
    age: Optional[int] = None
    area: Optional[str] = None
    gender: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# Taste Test Engine Models
class Attribute(BaseModel):
    attribute_id: str
    label: str
    description: Optional[str] = None
    scale_type: str
    is_required: bool = False
    diagnostic_group: str = "sensory"


class AttributeBankBase(BaseModel):
    category: str
    display_name: str
    version: int = 1
    core_attributes: List[Attribute] = Field(default_factory=list)
    sub_attributes: List[Attribute] = Field(default_factory=list)


class AttributeBankCreate(AttributeBankBase):
    pass


class AttributeBank(AttributeBankBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# --- Brand Image / Perception Models ---

class BrandAttribute(BaseModel):
    id: str  # analytics slug, e.g. "trustworthy"
    label_en: str
    label_ar: str
    category: str = "personality"  # personality, value, quality, innovation, emotional
    description: Optional[str] = None
    order: int = 0


class BrandAttributeBank(MongoBaseModel):
    name: str = "Standard Brand Image Bank"
    is_global: bool = True
    attributes: List[BrandAttribute] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProductConfig(BaseModel):
    product_code: str
    blind_code: str
    brand_name: Optional[str] = None
    expose_brand: bool = False


class CustomAttributeConfig(BaseModel):
    attribute_id: str
    label: str
    scale_type: str


class TasteTestBlocksConfig(BaseModel):
    include_awareness: bool = False
    include_usage_habits: bool = False
    include_category_behavior: bool = False
    include_brand_metrics: bool = False
    include_purchase_intent: bool = True


class EditorSettings(BaseModel):
    allow_wording_edits: bool = True
    analyst_only: bool = False
    locked_after: Optional[datetime] = None

class CustomSubAttribute(BaseModel):
    label: str
    minLabel: str
    maxLabel: str

class CustomResearchAttribute(BaseModel):
    main_attribute: str
    sub_attributes: List[CustomSubAttribute] = Field(default_factory=list)



# ── Question Module Registry (DB-driven survey modules) ─────────────────────

QuestionModuleId = Literal[
    "purchase_funnel",
    "brand_usage",
    "brand_pricing_behavior",
    "brand_analyzer",
    "product_test",
    "package_test",
]

QuestionType = Literal["open_single", "open_loop", "scq", "mcq", "linear_scale"]
BrandPipelineMode = Literal["exclude_prior", "include_prior"]
IncludeStrategy = Literal["cascade", "union", "intersection"]


class ModuleBrandPipeline(BaseModel):
    mode: BrandPipelineMode
    sources: List[str] = Field(default_factory=list)
    strategy: Optional[IncludeStrategy] = None


class QuestionOption(BaseModel):
    value: str = Field(..., min_length=1, description="Stable analytics slug, e.g. today, online_other")
    ar_label: str = ""
    en_label: str = ""
    allows_specify: bool = False
    order: int = 0


class ModuleQuestion(BaseModel):
    question_id: str = Field(..., min_length=1, pattern=r"^[a-z]{2}_q\d+$")
    label: str = ""
    type: QuestionType
    ar_text: str = ""
    en_text: str = ""
    order: int = 0
    required: bool = True
    analytical_role: Optional[str] = None
    options: List[QuestionOption] = Field(default_factory=list)
    brand_pipeline: Optional[ModuleBrandPipeline] = None
    has_stop: bool = False
    has_other: bool = False
    cati_instruction: Optional[str] = None

    # ── Research attribute mapping ──────────────────────────────────────────
    # The owning ModuleSection carries the MAIN attribute (its title); this is
    # the optional finer-grained breakdown beneath it. Optional by design: a
    # question may sit directly on its main attribute with no sub-attribute.
    sub_attribute: Optional[str] = None

    # ── linear_scale configuration ──────────────────────────────────────────
    # Ignored for every other question type. Defaults describe a 1-5 scale so
    # existing documents (which carry none of these keys) stay valid.
    #
    # `scale_variant` mirrors the frontend ScaleAnchorVariant:
    #   linear  — plain low-to-high intensity scale
    #   bipolar — opposed adjectives at each end
    #   jar     — Just About Right, the sensory-research scale whose midpoint
    #             is the ideal. Analytics treats JAR differently from an
    #             intensity scale (a 3 is the best score, not a middling one),
    #             so the variant has to be persisted, not inferred.
    scale_variant: Literal["linear", "bipolar", "jar"] = "linear"
    scale_min: int = Field(default=1, ge=0, le=100)
    scale_max: int = Field(default=5, ge=1, le=100)
    min_label: str = ""
    max_label: str = ""

    @model_validator(mode="after")
    def validate_scale(self) -> "ModuleQuestion":
        """
        Enforced here rather than on QuestionModuleBase because
        QuestionModuleCreate does not inherit that validator — a scale bound
        checked only there would go unchecked on the create path.
        """
        if self.type != "linear_scale":
            return self

        if self.scale_max <= self.scale_min:
            raise ValueError(
                f"scale_max must exceed scale_min on question {self.question_id}"
            )

        # JAR anchors are fixed at 1 / 3 / 5 by definition, so any other range
        # renders labels that do not match the points respondents can pick.
        if self.scale_variant == "jar" and (self.scale_min != 1 or self.scale_max != 5):
            raise ValueError(
                f"JAR scale on question {self.question_id} must run 1-5"
            )

        return self


class ModuleSection(BaseModel):
    """
    A section is the MAIN research attribute for the questions it holds.

    `title_en` / `title_ar` are the attribute name, and every question inside
    belongs to it. Finer breakdowns live on `ModuleQuestion.sub_attribute`,
    giving the module -> attribute -> question hierarchy the builder exposes.
    """
    section_id: str = Field(..., min_length=1)
    title_en: str = ""
    title_ar: str = ""
    order: int = 0
    questions: List[ModuleQuestion] = Field(default_factory=list)


class QuestionModuleBase(BaseModel):
    module_id: str = Field(..., min_length=1, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    version: int = Field(default=1, ge=1)
    is_active: bool = True
    sections: List[ModuleSection] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_module_structure(self) -> "QuestionModuleBase":
        all_qids: list[str] = []
        for section in self.sections:
            for question in section.questions:
                if question.question_id in all_qids:
                    raise ValueError(f"Duplicate question_id: {question.question_id}")
                all_qids.append(question.question_id)

                option_values = [opt.value for opt in question.options]
                if len(option_values) != len(set(option_values)):
                    raise ValueError(
                        f"Duplicate option values on question {question.question_id}"
                    )

                # Scale constraints live on ModuleQuestion itself so they apply
                # on every path, including QuestionModuleCreate (which does not
                # inherit this validator).

        qid_set = set(all_qids)
        for section in self.sections:
            for question in section.questions:
                if not question.brand_pipeline:
                    continue
                for src in question.brand_pipeline.sources:
                    if src not in qid_set:
                        raise ValueError(
                            f"brand_pipeline source '{src}' not found in module {self.module_id}"
                        )

        return self


class QuestionModuleCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    sections: List[ModuleSection] = Field(default_factory=list)


class QuestionModuleUpdate(QuestionModuleCreate):
    """Analyst PUT payload — creates a new version when applied."""


class QuestionModule(QuestionModuleBase, MongoBaseModel):
    question_count: int = 0
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class QuestionModuleSummary(BaseModel):
    """Metadata-only list item for GET /modules."""
    module_id: str
    name: str
    description: Optional[str] = None
    version: int
    is_active: bool
    question_count: int
    section_count: int
    updated_at: datetime


class ModuleSnapshot(QuestionModuleBase):
    """Immutable module copy frozen on a survey at creation time."""
    question_count: int = 0
    snapshotted_at: datetime = Field(default_factory=datetime.utcnow)
    source_version: int = Field(
        default=1,
        description="question_modules.version this snapshot was taken from",
    )


class PurchaseFunnelBrand(BaseModel):
    name_en: str
    name_ar: str

class PurchaseFunnel(MongoBaseModel):
    survey_id: str
    category_name: str
    brand_list: List[PurchaseFunnelBrand] = Field(default_factory=list)
    is_enabled: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TasteTestConfigBase(BaseModel):
    config_id: Optional[str] = None  # stable across versions
    family_id: Optional[str] = None  # groups multiple config versions
    version: int = 1
    research_flow: str  # A, B, C
    category: str
    category_version: int = 1
    language: str = "en" # "en" or "ar"
    own_brand: str = "" # legacy
    competitive_brands: List[str] = Field(default_factory=list) # legacy
    internal_brands_data: List[BrandMetadata] = Field(default_factory=list)
    competitor_brands_data: List[BrandMetadata] = Field(default_factory=list)
    products: List[ProductConfig] = Field(default_factory=list) # Legacy for now, or repurposed
    selected_attributes: List[str]
    custom_attributes: List[CustomAttributeConfig] = Field(default_factory=list)
    blocks: TasteTestBlocksConfig
    purchase_intent_goal: str = "top_2_box"
    editor_settings: EditorSettings
    status: str = "draft"  # draft, generated, locked


class TasteTestConfigCreate(TasteTestConfigBase):
    pass


class TasteTestConfig(TasteTestConfigBase, MongoBaseModel):
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MasterQuestionBase(BaseModel):
    question_id: str
    section: str
    main_attribute: str
    measures: Dict[str, str] = Field(default_factory=dict)
    fixed_questions: List[str] = Field(default_factory=list)
    optional_questions: List[str] = Field(default_factory=list)
    custom_research_attributes: List[CustomResearchAttribute] = Field(default_factory=list)
    analysis_purpose: Optional[str] = None


class MasterQuestion(MasterQuestionBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


#: How a rating scale should be read. Deliberately descriptive rather than a
#: "JAR" flag: the per-point labels carry the meaning, and this only records
#: which end (or middle) is the good outcome so reporting does not have to
#: guess from the scale length.
#:
#:   centered  — 5 points, the MIDDLE label is the ideal ("مناسب لى")
#:   hedonic   — 1-10, the TOP is best
#:   monotonic — 1-5 ladder, the TOP is best (e.g. purchase intent)
#:   open_end  — free text, no scale
ScaleShape = Literal["centered", "hedonic", "monotonic", "bipolar", "open_end"]


class TasteTestQuestionBase(BaseModel):
    question_id: str
    legacy_id: Optional[str] = None
    question_id_prefix: str = "tt"
    main_att: str
    supp_att: Optional[str] = None
    question_type: str
    ar_text: str
    en_text: str
    ar_options: Optional[str] = None
    en_options: Optional[str] = None
    ar_min_label: Optional[str] = None
    ar_max_label: Optional[str] = None
    en_min_label: Optional[str] = None
    en_max_label: Optional[str] = None
    timing: str  # "Before Taste" or "After Taste"
    question_status: str  # "fixed" or "optional"

    # ── Scale definition ────────────────────────────────────────────────────
    # `point_labels_*` hold one label per scale point (5 for a centered scale).
    # These are the authoritative description of what each answer means — both
    # the respondent UI and the reporting prompt read them, so a 3 on a
    # "مناسب لى" scale is understood as ideal while a 3 on purchase intent is
    # understood as lukewarm. All fields default, so documents written before
    # this existed stay valid.
    scale_shape: ScaleShape = "hedonic"
    scale_min: int = 1
    scale_max: int = 10
    point_labels_ar: List[str] = Field(default_factory=list)
    point_labels_en: List[str] = Field(default_factory=list)

    # Shown under the question for centered scales, explaining that the middle
    # option means "exactly right for me".
    instruction_ar: Optional[str] = None
    instruction_en: Optional[str] = None

    # Source-document guidance for `question_status == "optional"` attributes,
    # e.g. only ask about bitterness when bitterness is expected.
    condition_ar: Optional[str] = None
    condition_en: Optional[str] = None

    analytical_role: Optional[str] = None
    ai_followup: bool = False
    order: int = 0

    @model_validator(mode="after")
    def validate_scale(self) -> "TasteTestQuestionBase":
        if self.scale_shape == "open_end":
            return self

        if self.scale_max <= self.scale_min:
            raise ValueError(
                f"scale_max must exceed scale_min on question {self.question_id}"
            )

        # A labelled scale must label every point, or the respondent sees gaps
        # and reporting cannot map a score back to its meaning.
        for labels in (self.point_labels_ar, self.point_labels_en):
            if labels and len(labels) != (self.scale_max - self.scale_min + 1):
                raise ValueError(
                    f"question {self.question_id} has {len(labels)} labels for a "
                    f"{self.scale_min}-{self.scale_max} scale"
                )

        # The whole point of a centered scale is the labelled midpoint.
        if self.scale_shape == "centered" and not self.point_labels_ar:
            raise ValueError(
                f"centered scale {self.question_id} needs point_labels_ar"
            )

        return self

    @property
    def ideal_point(self) -> Optional[int]:
        """The score that represents the best outcome, or None for open ends."""
        if self.scale_shape == "centered":
            return (self.scale_min + self.scale_max) // 2
        if self.scale_shape in ("hedonic", "monotonic"):
            return self.scale_max
        return None


class TasteTestQuestion(TasteTestQuestionBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProductTestQuestionBase(BaseModel):
    question_id: str                          # "pt_q01"
    attribute: str                            # "Product Look"
    attribute_type: str                       # "sub" | "main" | "" (standalone)
    parent_attribute: Optional[str] = None    # "Product Appearance" or null
    diagnostic_tag: Optional[str] = None      # "PF" | "EM" | null
    question_type: str                        # "scale 1-5", "scale 1-10", "Open-End", etc.
    ar_text: str
    en_text: str
    ar_options: Optional[str] = None
    en_options: Optional[str] = None
    timing: str                               # "Before Use" | "During Use" | "After Use"
    question_status: str                      # "fixed" | "optional"
    order: int = 0


class ProductTestQuestion(ProductTestQuestionBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PackageTestQuestionBase(BaseModel):
    question_id: str                          # "pk_q01"
    attribute: str
    attribute_type: str
    parent_attribute: Optional[str] = None
    question_type: str
    ar_text: str
    en_text: str
    ar_options: Optional[str] = None
    en_options: Optional[str] = None
    timing: str
    question_status: str
    order: int = 0


class PackageTestQuestion(PackageTestQuestionBase, MongoBaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProductTestBankStatus(BaseModel):
    """Health snapshot for product/package test question banks (pre-flight checks)."""
    product_count: int = 0
    package_count: int = 0
    fixed_count: int = 0
    optional_count: int = 0
    package_fixed_count: int = 0
    package_optional_count: int = 0
    seeded: bool = False
    healthy: bool = False
    last_seeded_at: Optional[datetime] = None
    seed_source: Optional[str] = None
    excel_available: Optional[bool] = None


class ProductTestTrialMediaCapture(BaseModel):
    """Respondent trial / IHUT photo or video upload settings."""
    enabled: bool = False
    accepted_media: Literal["image", "video", "image_or_video"] = "image_or_video"
    required: bool = False
    timing: Literal["before_use", "during_use", "after_use"] = "after_use"
    prompt_en: str = (
        "Please upload a photo or short video showing your experience with the product during the trial."
    )
    prompt_ar: str = (
        "يرجى رفع صورة أو فيديو قصير يوضح تجربتك مع المنتج أثناء التجربة."
    )
    max_video_duration_seconds: int = Field(default=60, ge=5, le=120)
    max_image_mb: int = Field(default=5, ge=1, le=20)
    max_video_mb: int = Field(default=25, ge=5, le=100)


class ProductTestConfigBase(BaseModel):
    config_id: Optional[str] = None
    family_id: Optional[str] = None
    version: int = 1
    language: str = "ar"
    selected_attributes: List[str] = Field(default_factory=list)
    fixed_questions: List[str] = Field(default_factory=list)
    optional_questions: List[str] = Field(default_factory=list)
    package_test_enabled: bool = False        # toggle for package test attachment
    package_test_attributes: List[str] = Field(default_factory=list)
    packaging_heatmap_enabled: bool = False
    packaging_heatmap_images: Dict[str, Optional["PackagingImageAsset"]] = Field(
        default_factory=lambda: {"front": None, "back": None},
    )
    trial_media_capture: ProductTestTrialMediaCapture = Field(
        default_factory=ProductTestTrialMediaCapture,
    )
    status: str = "draft"


# ─── Packaging Heatmap (click-based package testing) ───────────────────────────

class PackagingImageAsset(BaseModel):
    """Stored reference to a packaging photo in GridFS."""
    asset_id: str
    side: str  # front | back
    survey_id: str
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    mime: str
    filename: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class ProductTestMediaAsset(BaseModel):
    """Respondent trial media reference stored in GridFS + registry collection."""
    asset_id: str
    survey_id: str
    token: str
    question_id: str
    media_type: Literal["image", "video"]
    mime: str
    filename: Optional[str] = None
    size_bytes: int = Field(gt=0)
    width: Optional[int] = Field(default=None, gt=0)
    height: Optional[int] = Field(default=None, gt=0)
    duration_seconds: Optional[float] = Field(default=None, gt=0)
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    lifecycle_state: Literal["pending", "submitted", "replaced", "orphaned"] = "pending"
    scan_status: Literal["pending", "clean", "quarantined", "skipped"] = "skipped"
    scan_detail: Optional[str] = None
    scan_engine: Optional[str] = None
    referenced_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None


class PackagingHeatmapFeedback(BaseModel):
    """Per-pin respondent feedback for packaging heatmap selections."""
    sentiment: Literal["like", "dislike", "recommend"]
    comment: Optional[str] = None
    voice_note_asset_id: Optional[str] = None
    follow_up_requested: bool = False


class PackagingHeatmapClick(BaseModel):
    """Single normalized click on a packaging image (0..1 coordinates)."""
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    ts: Optional[float] = None
    feedback: Optional[PackagingHeatmapFeedback] = None
    # Legacy frontend payloads may still include comment directly on click.
    comment: Optional[str] = None


class PackagingHeatmapAnswer(BaseModel):
    """Respondent answer payload for one heatmap question."""
    image_side: str
    intent: str  # attraction | dislikes | improve
    ref_width: int = Field(gt=0)
    ref_height: int = Field(gt=0)
    clicks: List[PackagingHeatmapClick] = Field(default_factory=list)


class PackagingHeatmapAggregate(BaseModel):
    """Pre-aggregated click density grid for analyst dashboards."""
    survey_id: str
    question_id: str
    image_side: str
    intent: str
    grid_size: int = 32
    bins: List[int] = Field(default_factory=list)
    total_clicks: int = 0
    response_count: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProductTestConfigCreate(ProductTestConfigBase):
    pass


class ProductTestConfig(ProductTestConfigBase, MongoBaseModel):
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


# Administrative & Security Models
class AuditLogBase(BaseModel):
    action: str  # e.g., "create_user", "delete_survey", "update_template"
    user_id: str
    username: str
    resource_type: str  # e.g., "users", "surveys", "templates"
    resource_id: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    client_ip: Optional[str] = None

class AuditLog(AuditLogBase, MongoBaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════════
# Survey Report Models — Analytics Pipeline Output
# ═══════════════════════════════════════════════════════════════════════

class ChartPayload(BaseModel):
    """Universal chart data envelope consumed by the frontend.

    Every chart in the report — regardless of type — is wrapped in this
    structure so the frontend can dispatch rendering via `chart_type`.
    """
    chart_id: str                                          # "pref_overall_BrandA_BrandB"
    chart_type: str                                        # bar | grouped_bar | radar | heatmap | gauge | stacked_bar | wordcloud | table | funnel | scorecard
    title: str
    subtitle: Optional[str] = None
    data: Dict[str, Any]                                   # Chart.js / Recharts-ready structure
    brands: List[str] = Field(default_factory=list)
    comparator: Optional[List[str]] = None                 # ["Brand A", "Brand B"]
    base_n: int = 0                                        # Sample size for this chart
    insight: str = ""                                      # Per-chart AI insight
    ai_headline: str = ""                                  # 1-2 sentence business insight
    ai_deep_analysis: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict) # Freeform: scale info, thresholds, etc.


class ReportSection(BaseModel):
    """One logical section of the report (maps 1:1 to a slide concept).

    Sections are ordered by `order` and may be grouped by comparator
    (e.g. "Brand A vs Brand B" in Taste Test studies).
    """
    section_id: str                                        # "taste_test_preference"
    section_name: str                                      # "Product Preference"
    section_type: str = "analysis"                         # analysis | summary | recommendation
    comparator_label: Optional[str] = None                 # "Brand A vs Brand B"
    charts: List[ChartPayload] = Field(default_factory=list)
    insight: str = ""                                      # Section-level AI narrative
    data_health: Dict[str, Any] = Field(default_factory=dict)  # Base sizes, completeness warnings
    order: int = 0                                         # Display sequence


class KeyFinding(BaseModel):
    label: str
    finding: str
    impact: str = "neutral"  # positive | negative | neutral


# ──────────────────────────────────────────────────────────────────────────────
# Opportunity-for-Improvement Engine Models
# ──────────────────────────────────────────────────────────────────────────────

class AttributeSignal(BaseModel):
    """
    High-fidelity quantitative signal for a single brand attribute.
    Acts as the source-of-truth for deterministic opportunity detection.
    """
    attribute: str
    mean_score: float
    sigma: float                    # standard deviation / variability
    gap_vs_market: float            # directional gap: target - competitor_avg
    purchase_intent_t2b: float      # Top-2-Box percentage (0-100)
    sample_n: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class QualitativeFeedback(BaseModel):
    """
    Grouped customer sentiment clusters for the target brand.
    Derived from unsupervised clustering of open-ended responses.
    """
    brand: str
    pain_points: List[str] = Field(default_factory=list)        # Extracted from dislikes
    suggestions: List[str] = Field(default_factory=list)        # Extracted from recommendations
    context_positives: List[str] = Field(default_factory=list)   # Extracted from likes


class OpportunityAction(BaseModel):
    """
    A specific, verb-led strategic recommendation grounded in verbatim feedback.
    """
    action: str
    category: str = "Tactical"     # e.g., "Immediate Fix", "Strategic Bet", "Marketing Pivot"
    source: str = "recommendation"  # "dislike" | "recommendation"
    index: int = 0                  # Order within the playbook


class OpportunityInsight(BaseModel):
    """
    Production-ready executive insight block.
    Links pre-calculated statistical signals to LLM-narrated strategic context.
    """
    title: str                           # Short, punchy business statement
    insight: str                         # 1-2 sentence data-linked explanation
    actions: List[OpportunityAction]     # Exactly 3 grounded action points
    
    # Strategic Metadata
    strategic_category: str = "Product"  # Product | Marketing | Quality | Channel
    impact: str = "Medium"               # High | Medium | Low
    effort: str = "Medium"               # High | Medium | Low
    priority_level: int = 3              # 1 (Critical) to 5 (Observational)
    
    # Statistical Grounding
    score: float = 0.0                   # Composite opportunity score (internal rank)
    gap_magnitude: float = 0.0           # Absolute performance gap
    confidence: float = 0.0              # Statistical confidence (mentions / N)
    attribute: str = ""                  # Source attribute name
    visual_data: Dict[str, Any] = Field(default_factory=dict)


from enum import Enum

class PositionArchetype(str, Enum):
    LEADER = "Leader"
    CHALLENGER = "Challenger"
    NICHE = "Niche"
    FOLLOWER = "Follower"

class ConfidenceLevel(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class AudienceSegment(BaseModel):
    segment_name: str
    rationale: str
    affinity_score: float

class MarketPositionResult(BaseModel):
    """
    [Task 3.3] Structured AI positioning verdict.
    Enforces the schema defined in Task 2.1 for the synthesizer.
    """
    market_position: PositionArchetype
    position_confidence: ConfidenceLevel
    target_audience_profile: str
    audience_segments: List[AudienceSegment]
    competitive_stance: str
    strategic_implications: List[str] # Exactly 3


SurveyTestingProtocol = Literal["branded", "blind", "monadic", "paired_comparison"]

_SURVEY_OBJECTIVE_LABELS: Dict[str, str] = {
    "taste_new_product": "New product concept test",
    "product_preference": "Product preference comparison",
    "sensory_evaluation": "Sensory evaluation",
    "price_sensitivity": "Price sensitivity study",
    "improvement_insights": "Improvement opportunity insights",
    "purchase_intent": "Purchase intent measurement",
}

_VALID_TESTING_PROTOCOLS = frozenset({"branded", "blind", "monadic", "paired_comparison"})


class SurveyContextBlock(BaseModel):
    """
    Normalized survey intelligence passed to every AI insight component.

    Built once per report generation from the MongoDB survey document and
  threaded through ChartInsightEngine, InsightAggregator, and prompt templates.
    """

    target_brand: str = ""
    category: str = ""
    survey_objective: str = ""
    testing_protocol: SurveyTestingProtocol = "branded"
    market: str = ""
    base_n: int = 0
    brand_count: int = 0
    methodology_notes: str = ""
    # What the survey actually measured. Without these the model can only talk
    # in generic category language, because it never learns which modules ran
    # or which attributes respondents were asked to rate.
    modules_used: List[str] = Field(default_factory=list)
    measured_attributes: List[str] = Field(default_factory=list)

    @staticmethod
    def _as_dict(value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        if hasattr(value, "model_dump"):
            return value.model_dump()
        return {}

    @staticmethod
    def _first_nonempty(*values: Any) -> str:
        for value in values:
            text = str(value or "").strip()
            if text:
                return text
        return ""

    @classmethod
    def _first_brand_name(cls, entries: Any) -> str:
        if not entries:
            return ""
        first = entries[0]
        if isinstance(first, dict):
            return str(first.get("name") or "").strip()
        return str(getattr(first, "name", "") or "").strip()

    @classmethod
    def _config_section(cls, survey_doc: Dict[str, Any], *keys: str) -> Dict[str, Any]:
        for key in keys:
            block = cls._as_dict(survey_doc.get(key))
            if block:
                return block
        return {}

    @classmethod
    def _resolve_target_brand(
        cls,
        survey_doc: Dict[str, Any],
        *,
        blueprint: Dict[str, Any],
        taste_config: Dict[str, Any],
        my_brand: str,
    ) -> str:
        internal_from_taste = taste_config.get("internal_brands") or taste_config.get("internal_brands_data")
        return cls._first_nonempty(
            blueprint.get("own_brand"),
            cls._first_brand_name(internal_from_taste),
            cls._first_brand_name(survey_doc.get("internal_brands_data")),
            survey_doc.get("my_brand"),
            survey_doc.get("own_brand"),
            my_brand,
        )

    @classmethod
    def _resolve_category(
        cls,
        survey_doc: Dict[str, Any],
        *,
        blueprint: Dict[str, Any],
        taste_config: Dict[str, Any],
        product_config: Dict[str, Any],
    ) -> str:
        return cls._first_nonempty(
            blueprint.get("category"),
            survey_doc.get("category"),
            taste_config.get("category"),
            product_config.get("category"),
            survey_doc.get("industry"),
        )

    @classmethod
    def _resolve_survey_objective(cls, survey_doc: Dict[str, Any]) -> str:
        raw = cls._first_nonempty(survey_doc.get("survey_objective"))
        other = cls._first_nonempty(survey_doc.get("survey_objective_other"))

        if raw == "other" and other:
            return other
        if raw in _SURVEY_OBJECTIVE_LABELS:
            return _SURVEY_OBJECTIVE_LABELS[raw]
        return cls._first_nonempty(raw, other)

    @classmethod
    def _normalize_testing_protocol(cls, value: Any) -> SurveyTestingProtocol:
        protocol = str(value or "branded").strip().lower()
        if protocol in _VALID_TESTING_PROTOCOLS:
            return protocol  # type: ignore[return-value]
        return "branded"

    @classmethod
    def _resolve_testing_protocol(
        cls,
        *,
        taste_config: Dict[str, Any],
        product_config: Dict[str, Any],
        snapshot: Dict[str, Any],
    ) -> SurveyTestingProtocol:
        snapshot_ctx = cls._as_dict(snapshot.get("brand_context"))
        return cls._normalize_testing_protocol(
            cls._first_nonempty(
                taste_config.get("testing_protocol"),
                product_config.get("testing_protocol"),
                snapshot_ctx.get("testing_protocol"),
            )
            or "branded"
        )

    @classmethod
    def _resolve_market(cls, survey_doc: Dict[str, Any]) -> str:
        customizations = cls._as_dict(survey_doc.get("customizations"))
        blueprint = cls._as_dict(survey_doc.get("blueprint"))
        return cls._first_nonempty(
            survey_doc.get("market"),
            customizations.get("market"),
            blueprint.get("market"),
            customizations.get("country"),
        )

    @classmethod
    def _resolve_brand_names(
        cls,
        survey_doc: Dict[str, Any],
        *,
        blueprint: Dict[str, Any],
        taste_config: Dict[str, Any],
        explicit_brands: Optional[List[str]],
    ) -> List[str]:
        if explicit_brands:
            return [str(b).strip() for b in explicit_brands if str(b).strip()]

        names: List[str] = []
        for entry in blueprint.get("brands") or []:
            name = entry.get("name") if isinstance(entry, dict) else getattr(entry, "name", "")
            if name and name not in names:
                names.append(str(name).strip())

        if names:
            return names

        for source in (
            survey_doc.get("internal_brands_data"),
            taste_config.get("internal_brands_data"),
            taste_config.get("internal_brands"),
        ):
            for entry in source or []:
                name = entry.get("name") if isinstance(entry, dict) else getattr(entry, "name", "")
                if name and name not in names:
                    names.append(str(name).strip())

        for source in (
            survey_doc.get("competitor_brands_data"),
            taste_config.get("competitor_brands_data"),
            taste_config.get("competitive_brands"),
        ):
            for entry in source or []:
                if isinstance(entry, dict):
                    name = entry.get("name", "")
                elif isinstance(entry, str):
                    name = entry
                else:
                    name = getattr(entry, "name", "")
                if name and name not in names:
                    names.append(str(name).strip())

        return names

    @classmethod
    def _resolve_modules_used(
        cls,
        survey_doc: Dict[str, Any],
        *,
        taste_config: Dict[str, Any],
        product_config: Dict[str, Any],
        snapshot: Dict[str, Any],
    ) -> List[str]:
        """Human-readable list of the question modules this survey ran."""
        modules: List[str] = []

        def _add(value: Any) -> None:
            text = str(value or "").strip()
            if not text:
                return
            label = text.replace("_", " ").strip().title()
            if label and label not in modules:
                modules.append(label)

        for key in ("selected_modules", "modules", "enabled_modules"):
            for source in (survey_doc, taste_config, product_config):
                for entry in cls._as_dict(source).get(key) or []:
                    if isinstance(entry, dict):
                        _add(entry.get("id") or entry.get("key") or entry.get("name"))
                    else:
                        _add(entry)

        # Product-test snapshots express modules per section instead.
        for phase in snapshot.get("phases") or []:
            if not isinstance(phase, dict):
                continue
            for section in phase.get("sections") or []:
                if isinstance(section, dict):
                    _add(section.get("module"))

        if survey_doc.get("purchase_funnel") or taste_config.get("purchase_funnel"):
            _add("purchase funnel")

        return modules

    @classmethod
    def _resolve_measured_attributes(
        cls,
        survey_doc: Dict[str, Any],
        *,
        blueprint: Dict[str, Any],
        taste_config: Dict[str, Any],
    ) -> List[str]:
        """Main attributes respondents actually rated, in survey order."""
        attributes: List[str] = []

        def _add(value: Any) -> None:
            text = str(value or "").strip()
            if text and text not in attributes:
                attributes.append(text)

        for entry in taste_config.get("attribute_sequence") or []:
            if isinstance(entry, dict):
                _add(entry.get("main_attribute"))

        for name in (blueprint.get("attributes") or {}):
            _add(name)

        for entry in blueprint.get("custom_research_attributes") or []:
            if isinstance(entry, dict):
                _add(entry.get("main_attribute"))

        return attributes

    @classmethod
    def _build_methodology_notes(cls, testing_protocol: str, base_n: int, brand_count: int) -> str:
        respondent_label = "respondent" if base_n == 1 else "respondents"
        brand_label = "brand" if brand_count == 1 else "brands"
        return (
            f"{testing_protocol.upper()} test, {base_n} {respondent_label}, "
            f"{brand_count} {brand_label}"
        )

    @classmethod
    def from_survey_doc(
        cls,
        survey_doc: Dict[str, Any],
        my_brand: str,
        base_n: int,
        *,
        brands: Optional[List[str]] = None,
    ) -> "SurveyContextBlock":
        """
        Extract report AI context from a raw MongoDB survey document.

        Priority chains follow product/taste-test orchestration conventions.
        Optional `brands` overrides brand discovery when ingest has already
        resolved the authoritative brand list.
        """
        blueprint = cls._as_dict(survey_doc.get("blueprint"))
        taste_config = cls._config_section(survey_doc, "taste_test_config", "tasteTestConfig")
        product_config = cls._config_section(survey_doc, "product_test_config", "productTestConfig")
        snapshot = cls._as_dict(survey_doc.get("product_test_snapshot"))

        target_brand = cls._resolve_target_brand(
            survey_doc,
            blueprint=blueprint,
            taste_config=taste_config,
            my_brand=my_brand,
        )
        category = cls._resolve_category(
            survey_doc,
            blueprint=blueprint,
            taste_config=taste_config,
            product_config=product_config,
        )
        survey_objective = cls._resolve_survey_objective(survey_doc)
        testing_protocol = cls._resolve_testing_protocol(
            taste_config=taste_config,
            product_config=product_config,
            snapshot=snapshot,
        )
        market = cls._resolve_market(survey_doc)
        brand_names = cls._resolve_brand_names(
            survey_doc,
            blueprint=blueprint,
            taste_config=taste_config,
            explicit_brands=brands,
        )
        brand_count = len(brand_names)
        methodology_notes = cls._build_methodology_notes(testing_protocol, base_n, brand_count)
        modules_used = cls._resolve_modules_used(
            survey_doc,
            taste_config=taste_config,
            product_config=product_config,
            snapshot=snapshot,
        )
        measured_attributes = cls._resolve_measured_attributes(
            survey_doc,
            blueprint=blueprint,
            taste_config=taste_config,
        )

        return cls(
            target_brand=target_brand,
            category=category,
            survey_objective=survey_objective,
            testing_protocol=testing_protocol,
            market=market,
            base_n=base_n,
            brand_count=brand_count,
            methodology_notes=methodology_notes,
            modules_used=modules_used,
            measured_attributes=measured_attributes,
        )

    def to_prompt_variables(self) -> Dict[str, str]:
        """Flatten to string variables for PromptOrchestrator / chart_insights templates."""
        return {
            "target_brand": self.target_brand,
            "brand_name": self.target_brand,
            "category": self.category,
            "survey_objective": self.survey_objective,
            "testing_protocol": self.testing_protocol,
            "market": self.market,
            "base_n": str(self.base_n),
            "brand_count": str(self.brand_count),
            "methodology_notes": self.methodology_notes,
            "modules_used": ", ".join(self.modules_used) or "Not specified",
            "measured_attributes": ", ".join(self.measured_attributes) or "Not specified",
        }


class ReportInsights(BaseModel):
    """Aggregated AI insights at report level — the 'story' layer."""
    executive_summary: str = ""
    key_findings: List[KeyFinding] = Field(default_factory=list)
    brand_swot: Dict[str, Dict[str, List[str]]] = Field(default_factory=dict)   # {brand: {strengths:[], weaknesses:[], opportunities:[], threats:[]}}
    recommendations_4p: Dict[str, str] = Field(default_factory=dict)             # {product: "...", price: "...", place: "...", promotion: "..."}
    opportunity_insights: List[OpportunityInsight] = Field(default_factory=list)
    market_position_report: Optional[MarketPositionResult] = None # Task 3.1 & 3.3
    competitive_narrative: str = ""

class ReportDataContext(BaseModel):
    """
    Hybrid context object carrying both AI narration (story layer) and 
    raw chart metrics (data layer) to the final aggregator.
    
    Ensures that if AI narration fails or hallucinates, the aggregator 
    can fallback to interpreting the raw numbers directly.
    """
    narrator_history: List[Dict[str, Any]] = Field(default_factory=list)
    hero_metrics: Dict[str, Any] = Field(default_factory=dict)
    verbatim_takeaways: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SurveyReport(MongoBaseModel):
    """Root document persisted in the `survey_reports` MongoDB collection.

    One report per survey. Regeneration overwrites via upsert on `survey_id`.
    Status lifecycle: pending → generating → ready | failed | stale
    """
    survey_id: str
    status: str = "pending"                                # pending | generating | ready | failed | stale
    error_message: Optional[str] = None
    research_type: str = ""                                # "TasteTest" | "UsageAndAttitude" | "BAPF"
    project_name: str = ""
    brand_list: List[str] = Field(default_factory=list)
    brands: List[str] = Field(default_factory=list)        # NEW: clean brand list
    total_responses: int = 0
    base_n: int = 0                                        # NEW: total respondents
    sections: List[ReportSection] = Field(default_factory=list)  # Legacy
    charts: List[Dict[str, Any]] = Field(default_factory=list)   # NEW: flat chart array (Phase C pipeline)
    insights: ReportInsights = Field(default_factory=ReportInsights)
    pptx_path: Optional[str] = None
    telemetry: Dict[str, Any] = Field(default_factory=dict)
    ai_cost_manifest: Optional[Dict[str, Any]] = None
    generated_at: Optional[datetime] = None
    generated_by: Optional[str] = None
    generation_duration_s: Optional[float] = None
    version: int = 1


class AIInsightCacheEntry(MongoBaseModel):
    """
    Cached AI response for a specific analytical component.
    Acts as the persistent long-term memory for the AI reporting pipeline.
    """
    survey_id: str = Field(..., description="Foreign key to the Survey")
    component_type: str = Field(..., description="Type: chart_insight, slide_insight, verbatim, etc.")
    component_key: str = Field(..., description="Unique key for the component (e.g., chart_id or slide_id)")
    
    # Versioning & Integrity
    prompt_version: str = Field(
        "2.0.0",
        description="The version of the prompt registry used (bump to invalidate cached AI responses)",
    )
    prefix_version: str = Field(
        "2.0.0",
        description="The foundational God Prompt version (bump invalidates prefix-scoped cache entries)",
    )
    prompt_hash: str = Field("", description="SHA-256 hash of the full prompt string for invalidation check")
    
    # Payload
    ai_headline: str = ""
    ai_deep_analysis: List[Dict[str, Any]] = Field(default_factory=list)
    raw_response: str = Field("", description="The raw, unparsed string returned by the LLM")
    
    # Telemetry & Cost Tracking
    model_used: str = "gpt-4o-mini"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    
    # Lifecycle Management
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None


# ── Respondent Session Models (Throw Back Persistence) ────────────────────

class SurveySessionBase(BaseModel):
    token: str = Field(..., description="Unique respondent token")
    answers: Dict[str, Any] = Field(default_factory=dict)
    l2Answers: Dict[str, Any] = Field(default_factory=dict)
    moduleAnswers: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    moduleStepIndexes: Dict[str, int] = Field(default_factory=dict)
    currentModuleId: Optional[str] = None
    completedModules: List[str] = Field(default_factory=list)
    currentBrandIndex: int = 0
    step: str = "layer1"
    phone: Optional[str] = None
    countryCode: Optional[str] = None
    customBrands: List[str] = Field(default_factory=list)
    aiInsights: Dict[str, List[str]] = Field(default_factory=dict)
    productTestAnswers: Dict[str, Any] = Field(default_factory=dict)
    productTestPhaseIndex: int = 0
    productTestSectionIndex: int = 0
    productTestWizardMode: str = "intro"
    startTime: Optional[float] = None
    version: int = 1


class SurveySessionUpdate(BaseModel):
    answers: Optional[Dict[str, Any]] = None
    l2Answers: Optional[Dict[str, Any]] = None
    moduleAnswers: Optional[Dict[str, Dict[str, Any]]] = None
    moduleStepIndexes: Optional[Dict[str, int]] = None
    currentModuleId: Optional[str] = None
    completedModules: Optional[List[str]] = None
    currentBrandIndex: Optional[int] = None
    step: Optional[str] = None
    phone: Optional[str] = None
    countryCode: Optional[str] = None
    customBrands: Optional[List[str]] = None
    aiInsights: Optional[Dict[str, List[str]]] = None
    productTestAnswers: Optional[Dict[str, Any]] = None
    productTestPhaseIndex: Optional[int] = None
    productTestSectionIndex: Optional[int] = None
    productTestWizardMode: Optional[str] = None
    startTime: Optional[float] = None
    version: Optional[int] = None


class SurveySession(SurveySessionBase, MongoBaseModel):
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
