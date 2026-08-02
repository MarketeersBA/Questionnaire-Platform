from typing import Any, Dict, List, Optional
from datetime import datetime
from backend.database import db
from backend.services.question_module_service import question_module_service
from backend.utils.taste_test_question_ids import build_module_metadata, resolve_taste_test_question_id
import random
import string
import re

# Arabic labels for taste-test main attributes shown in respondent section titles.
TASTE_ATTRIBUTE_AR: Dict[str, str] = {
    "Appearance": "المظهر",
    "Visual Appearance": "المظهر البصري",
    "Color": "اللون",
    "Odor": "الرائحة",
    "Aroma": "الرائحة",
    "Aroma Profile": "خصائص الرائحة",
    "Texture": "القوام",
    "Texture Profile": "خصائص القوام",
    "Physical Texture": "القوام الفيزيائي",
    "Taste Profile": "خصائص الطعم",
    "Before Taste": "قبل التذوق",
    "After Taste": "بعد التذوق",
    "Aftertaste": "الطعم المتبقي",
    "Aftertaste & Finish": "الطعم المتبقي والنهاية",
    "Overall Taste": "الطعم العام",
    "Overall Likeness": "الإعجاب العام",
    "Overall Satisfaction": "الرضا العام",
    "Flavor Intensity": "شدة النكهة",
    "Mouthfeel": "الإحساس في الفم",
    "Mouthfeel Experience": "تجربة الإحساس في الفم",
    "Freshness": "الانتعاش",
    "Freshness Perception": "الإحساس بالانتعاش",
    "Authenticity": "الأصالة",
    "Product Authenticity": "أصالة المنتج",
}


def localize_taste_test_attribute(name: str, language: str) -> str:
    if not name or language != "ar":
        return name or ""
    return TASTE_ATTRIBUTE_AR.get(name) or TASTE_ATTRIBUTE_AR.get(name.strip()) or name


class OrchestrationService:
    def format_text(self, text: str, product: str = "product", category: str = "Category", brand: str = "Brand") -> str:
        if not text:
            return ""
        
        # English placeholders
        text = re.sub(r'\[product\]', product, text, flags=re.IGNORECASE)
        text = re.sub(r'\[Category\]', category, text, flags=re.IGNORECASE)
        text = re.sub(r'\[brand\]', brand, text, flags=re.IGNORECASE)
        
        # Arabic placeholders
        text = text.replace("(المنتج)", product)
        text = text.replace("المنتج", product)
        text = text.replace("(البراند)", brand)
        text = text.replace("البراند", brand)
        
        return text

    def map_taste_test_question(self, q: Dict[str, Any], brand_name: str, attr_name: str, language: str, category: str, meta: Dict[str, Any]) -> Dict[str, Any]:
        is_arabic = language == 'ar'
        text = q.get('ar_text') if is_arabic and q.get('ar_text') else q.get('en_text', '')
        raw_options = q.get('ar_options') if is_arabic and q.get('ar_options') else q.get('en_options', [])

        q_type_str = (q.get('question_type') or "").lower()
        is_scale = 'scale' in q_type_str
        is_numeric = 'numeric' in q_type_str
        is_bipolar = 'bipolar' in q_type_str
        is_open_ended = 'open-end' in q_type_str or 'text' in q_type_str

        scale_max = 5
        scale_match = re.search(r'(\d+)-(\d+)', q_type_str)
        if scale_match:
            scale_max = int(scale_match.group(2))
        elif '10' in q_type_str:
            scale_max = 10

        options = raw_options
        if isinstance(options, str):
            options = [o.strip() for o in options.split(',')]

        final_type = 'mcq'
        if is_open_ended: final_type = 'open-ended'
        elif is_numeric: final_type = 'number'
        elif is_scale: final_type = 'scale'
        elif is_bipolar: final_type = 'bipolar'

        if final_type == 'mcq' and len(options) == 1 and options[0].lower() == 'open-end':
            final_type = 'open-ended'
            options = []
        
        if final_type == 'open-ended':
            options = []

        min_label = q.get('ar_min_label' if is_arabic else 'en_min_label', "")
        max_label = q.get('ar_max_label' if is_arabic else 'en_max_label', "")

        if (not min_label or not max_label) and isinstance(raw_options, str) and '=' in raw_options:
            parts = [o.strip() for o in raw_options.split(',')]
            for p in parts:
                if '=' in p:
                    val, lbl = p.split('=', 1)
                    if val.strip() == '1': min_label = lbl.strip()
                    if val.strip() == str(scale_max) or p == parts[-1]: max_label = lbl.strip()

        canonical_id = resolve_taste_test_question_id(q, meta)
        
        return {
            "id": canonical_id or f"q_{''.join(random.choices(string.ascii_lowercase + string.digits, k=9))}",
            "text": self.format_text(text, product=brand_name if brand_name else category, category=category, brand=brand_name),
            "type": final_type,
            "options": options,
            "required": True,
            "timing": q.get("timing"),
            "questionMeta": {
                "nature": "fixed" if q.get("question_status") == "fixed" else "dynamic",
                "inputType": "open-ended" if final_type == "open-ended" else ("numeric" if is_numeric else ("scale" if is_scale else ("bipolar" if is_bipolar else "single-choice"))),
                "options": options,
                "scaleMax": scale_max if is_scale else None,
                "minLabel": min_label,
                "maxLabel": max_label,
                "bipolarLeft": min_label if is_bipolar else None,
                "bipolarRight": max_label if is_bipolar else None,
                "canonicalQuestionId": canonical_id,
                "legacyQuestionId": q.get("legacy_id"),
                "questionIdPrefix": meta.get("question_id_prefix")
            }
        }

    async def fetch_taste_test_master_data(self, selections: Dict[str, List[str]]) -> Dict[str, Any]:
        col = db.get_collection("taste_test_questions")
        fixed_questions = await col.find({"question_status": "fixed"}).to_list(length=100)
        
        results: Dict[str, List[Dict]] = {"fixed": fixed_questions}
        all_docs = list(fixed_questions)

        for main_att, supp_attrs in selections.items():
            query = {"main_att": main_att, "question_status": "optional"}
            if supp_attrs:
                query["supp_att"] = {"$in": supp_attrs + [None, ""]}
            else:
                query["supp_att"] = {"$in": [None, ""]}
            
            opt_questions = await col.find(query).to_list(length=100)
            all_docs.extend(opt_questions)
            results[main_att] = opt_questions

        meta = build_module_metadata(all_docs)
        return {"data": results, "meta": meta}

    async def compose_survey_schema(self, survey_data: Dict[str, Any]) -> Dict[str, Any]:
        from backend.services.product_test_orchestration import (
            resolve_orchestration_category,
            resolve_orchestration_language,
        )

        config = survey_data.get("config") or {}
        language = resolve_orchestration_language(survey_data)
        category = resolve_orchestration_category(survey_data)
        
        # Modules to compose
        selected_modules = survey_data.get("selected_modules") or survey_data.get("module_sequence") or []
        
        results = {
            "layer1_structure": {"sections": []},
            "layer2_structure": {"sections": []},
            "layer3_structure": {"sections": []},
            "layer4_structure": {"sections": []},
            "layer5_structure": {"sections": []},
            "layer6_structure": {"sections": []},
            "layer7_structure": {"sections": []},
            "product_test_snapshot": None,
        }

        for module_id in selected_modules:
            # ── Taste Test (L1 & L2) ───────────────────────────────────────────
            if module_id == "taste_test":
                tt_config = survey_data.get("taste_test_config") or config
                selections = tt_config.get("attributes", {})
                master = await self.fetch_taste_test_master_data(selections)
                master_data = master["data"]
                meta = master["meta"]

                internal_brands = [b["name"] for b in tt_config.get("internal_brands_data", [])]
                competitor_brands = [b["name"] for b in tt_config.get("competitor_brands_data", [])]
                if not internal_brands and tt_config.get("own_brand"):
                    internal_brands = [tt_config["own_brand"]]
                if not competitor_brands and tt_config.get("competitive_brands"):
                    competitor_brands = tt_config["competitive_brands"]
                
                all_brands = [b for b in internal_brands + competitor_brands if b]

                # L1
                l1_questions = [
                    self.map_taste_test_question(q, "", "", language, category, meta)
                    for q in master_data.get("fixed", [])
                    if q.get("timing") == "Layer 1"
                ]
                results["layer1_structure"]["sections"].append({
                    "title": "الوعي وعادات الاستخدام" if language == 'ar' else "Awareness & Usage Habits",
                    "module": "taste_test",
                    "questions": l1_questions
                })

                # L2
                l2_sections = []
                before_taste = [
                    self.map_taste_test_question(q, "", "", language, category, meta)
                    for q in master_data.get("fixed", [])
                    if q.get("timing") == "Before Taste"
                ]
                if before_taste:
                    l2_sections.append({
                        "title": "قبل التذوق" if language == 'ar' else "Before Taste",
                        "module": "taste_test",
                        "questions": before_taste
                    })


                # 1. Individual Brand Evaluation (L2) Loop
                for brand in all_brands:
                    # Attributes sequence
                    sequence = tt_config.get("attribute_sequence") or []
                    if not sequence:
                        # Reconstruct from attributes map if sequence is missing
                        for main_attr, subs in selections.items():
                            sequence.append({"main_attribute": main_attr, "sub_attributes": subs, "source": "library"})
                        
                        customs = tt_config.get("custom_research_attributes") or []
                        for c in customs:
                            if c["main_attribute"] not in selections:
                                sequence.append({"main_attribute": c["main_attribute"], "sub_attributes": [s["label"] for s in c.get("sub_attributes", [])], "source": "custom"})

                    for seq_item in sequence:
                        main_attr = seq_item["main_attribute"]
                        source = seq_item.get("source", "library")
                        sub_labels = seq_item.get("sub_attributes") or []

                        attr_questions = []
                        if source == "library":
                            attr_questions = [
                                self.map_taste_test_question(q, brand, main_attr, language, category, meta)
                                for q in master_data.get(main_attr, [])
                                if q.get("timing") != "Layer 1"
                            ]

                        # Custom handling
                        matching_custom = next((c for c in tt_config.get("custom_research_attributes", []) if c["main_attribute"] == main_attr), None)
                        display_attr = localize_taste_test_attribute(main_attr, language)
                        
                        if source == "custom" or matching_custom:
                            if not attr_questions:
                                # Fallback main eval
                                attr_questions.insert(0, {
                                    "id": f"{brand}_fallback_{main_attr.replace(' ', '_')}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}",
                                    "type": "scale",
                                    "text": f"ما رأيك في ({display_attr}) الخاصة بـ {brand}؟" if language == 'ar' else f"What do you think about ({main_attr}) for {brand}?",
                                    "options": [],
                                    "required": True,
                                    "timing": "After Taste",
                                    "questionMeta": {
                                        "nature": "dynamic",
                                        "inputType": "scale",
                                        "minLabel": "لا يعجبني" if language == 'ar' else "Dislikes",
                                        "maxLabel": "يعجبني" if language == 'ar' else "Likes",
                                        "scaleMax": 10
                                    }
                                })
                            
                            for label in sub_labels:
                                sub_obj = next((s for s in matching_custom["sub_attributes"] if s["label"] == label), None) if matching_custom else None
                                min_l = sub_obj["minLabel"] if sub_obj else ("سيء" if language == 'ar' else "Poor")
                                max_l = sub_obj["maxLabel"] if sub_obj else ("ممتاز" if language == 'ar' else "Excellent")
                                
                                attr_questions.append({
                                    "id": f"{brand}_custom_sub_{label.replace(' ', '_')}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}",
                                    "type": "scale",
                                    "text": f"{display_attr} - {label} ({min_l} - {max_l})" if language == 'ar' else f"{main_attr}: How is the {label}? ({min_l} - {max_l})",
                                    "options": [],
                                    "required": True,
                                    "timing": "After Taste",
                                    "questionMeta": {
                                        "nature": "dynamic",
                                        "inputType": "scale",
                                        "minLabel": min_l,
                                        "maxLabel": max_l,
                                        "scaleMax": 5
                                    }
                                })
                        elif not attr_questions:
                             # Pure library fallback
                             attr_questions.append({
                                "id": f"{brand}_fallback_{main_attr.replace(' ', '_')}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}",
                                "type": "scale",
                                "text": f"ما رأيك في ({display_attr}) الخاصة بـ {brand}؟" if language == 'ar' else f"What do you think about ({main_attr}) for {brand}?",
                                "options": [],
                                "required": True,
                                "timing": "After Taste",
                                "questionMeta": {
                                    "nature": "dynamic",
                                    "inputType": "scale",
                                    "minLabel": "لا يعجبني" if language == 'ar' else "Dislikes",
                                    "maxLabel": "يعجبني" if language == 'ar' else "Likes",
                                    "scaleMax": 10
                                }
                            })

                        if attr_questions:
                            l2_sections.append({
                                "title": f"{brand}: {display_attr}",
                                "brand": brand,
                                "module": "taste_test",
                                "attribute": main_attr,
                                "questions": attr_questions
                            })

                    # Brand fixed after taste
                    brand_fixed = [
                        self.map_taste_test_question(q, brand, "", language, category, meta)
                        for q in master_data.get("fixed", [])
                        if q.get("timing") == "After Taste"
                    ]
                    if brand_fixed:
                        l2_sections.append({
                            "title": f"{brand}: {'تقييم عام' if language == 'ar' else 'General Evaluation'}",
                            "brand": brand,
                            "module": "taste_test",
                            "questions": brand_fixed
                        })

                # Overall preference
                if len(all_brands) > 1:
                    l2_sections.append({
                        "title": "التفضيل" if language == 'ar' else "Preference",
                        "module": "taste_test",
                        "questions": [{
                            "id": "overall_preference",
                            "text": "أي منتج تفضله أكثر؟" if language == 'ar' else "Which product did you prefer the most?",
                            "type": "mcq",
                            "options": all_brands,
                            "required": True,
                            "questionMeta": {
                                "nature": "fixed",
                                "inputType": "single-choice",
                                "options": all_brands
                            }
                        }]
                    })
                
                results["layer2_structure"]["sections"].extend(l2_sections)

            # ── Product Test (dedicated snapshot — not layer2) ───────────────────
            elif module_id == "product_test":
                pt_config = survey_data.get("product_test_config") or {}
                if pt_config or survey_data.get("type") == "product_test":
                    snapshot = await self.compose_product_test_snapshot(pt_config, language, survey_data)
                    results["product_test_snapshot"] = snapshot

            # ── Purchase Funnel (L4) ───────────────────────────────────────────
            elif module_id == "purchase_funnel":
                pf_config = survey_data.get("purchase_funnel") or {}
                if pf_config.get("is_enabled"):
                    mod_doc = await question_module_service.get_active_module("purchase_funnel")
                    if mod_doc:
                        sections = self.generate_configurable_layer(mod_doc, pf_config, language, category, "purchase_funnel")
                        results["layer4_structure"]["sections"].extend(sections)

            # ── Brand Usage (L5) ───────────────────────────────────────────────
            elif module_id == "brand_usage":
                usage_config = survey_data.get("brand_usage") or {}
                if usage_config.get("is_enabled"):
                    mod_doc = await question_module_service.get_active_module("brand_usage")
                    if mod_doc:
                        sections = self.generate_configurable_layer(mod_doc, usage_config, language, category, "brand_usage")
                        results["layer5_structure"]["sections"].extend(sections)

            # ── Brand Pricing Behavior (L6) ───────────────────────────────────
            elif module_id == "brand_pricing_behavior":
                pricing_config = survey_data.get("brand_pricing_behavior") or {}
                if pricing_config.get("is_enabled"):
                    mod_doc = await question_module_service.get_active_module("brand_pricing_behavior")
                    if mod_doc:
                        sections = self.generate_configurable_layer(mod_doc, pricing_config, language, category, "brand_pricing_behavior")
                        results["layer6_structure"]["sections"].extend(sections)

            # ── Brand Analyzer (L7) ───────────────────────────────────────────
            elif module_id == "brand_analyzer":
                ba_config = survey_data.get("brand_analyzer") or {}
                if ba_config.get("is_enabled"):
                    pf_active = "purchase_funnel" in selected_modules and (survey_data.get("purchase_funnel") or {}).get("is_enabled", False)
                    
                    internal_brands = survey_data.get("internal_brands_data", [])
                    competitor_brands = survey_data.get("competitor_brands_data", [])
                    survey_brands = internal_brands + competitor_brands
                    
                    sections = await self.compose_brand_analyzer_layer(ba_config, language, category, pf_active, survey_brands)
                    results["layer7_structure"]["sections"].extend(sections)

        return results

    def map_product_test_question(self, q: Dict[str, Any], language: str) -> Dict[str, Any]:
        """Map a product_test or package_test question document to the schema format."""
        is_arabic = language == 'ar'
        text = q.get('ar_text') if is_arabic and q.get('ar_text') else q.get('en_text', '')
        raw_options = q.get('ar_options') if is_arabic and q.get('ar_options') else q.get('en_options', [])

        q_type_str = (q.get('question_type') or "").lower()
        is_scale = 'scale' in q_type_str
        is_numeric = 'numeric' in q_type_str
        is_bipolar = 'bipolar' in q_type_str
        is_open_ended = 'open-end' in q_type_str or 'text' in q_type_str

        scale_max = 5
        scale_match = re.search(r'(\d+)-(\d+)', q_type_str)
        if scale_match:
            scale_max = int(scale_match.group(2))
        elif '10' in q_type_str:
            scale_max = 10

        options = raw_options
        if isinstance(options, str):
            options = [o.strip() for o in options.split(',')]

        final_type = 'mcq'
        if is_open_ended: final_type = 'open-ended'
        elif is_numeric: final_type = 'number'
        elif is_scale: final_type = 'scale'
        elif is_bipolar: final_type = 'bipolar'

        if final_type == 'mcq' and len(options) == 1 and options[0].lower() == 'open-end':
            final_type = 'open-ended'
            options = []
        if final_type == 'open-ended':
            options = []

        min_label = ""
        max_label = ""
        if isinstance(raw_options, str) and '=' in raw_options:
            parts = [o.strip() for o in raw_options.split(',')]
            for p in parts:
                if '=' in p:
                    val, lbl = p.split('=', 1)
                    if val.strip() == '1': min_label = lbl.strip()
                    if val.strip() == str(scale_max) or p == parts[-1]: max_label = lbl.strip()

        return {
            "id": q.get("question_id", f"pt_{''.join(random.choices(string.ascii_lowercase + string.digits, k=6))}"),
            "text": text,
            "type": final_type,
            "options": options,
            "required": True,
            "timing": q.get("timing"),
            "diagnostic_tag": q.get("diagnostic_tag"),
            "questionMeta": {
                "nature": "fixed" if q.get("question_status") == "fixed" else "dynamic",
                "inputType": "open-ended" if final_type == "open-ended" else ("numeric" if is_numeric else ("scale" if is_scale else ("bipolar" if is_bipolar else "single-choice"))),
                "options": options,
                "scaleMax": scale_max if is_scale else None,
                "minLabel": min_label or None,
                "maxLabel": max_label or None,
                "bipolarLeft": min_label if is_bipolar else None,
                "bipolarRight": max_label if is_bipolar else None,
                "canonicalQuestionId": q.get("question_id"),
                "diagnostic_tag": q.get("diagnostic_tag"),
            }
        }

    async def compose_product_test_snapshot(
        self,
        pt_config: Dict[str, Any],
        language: str,
        survey_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Compose timing-phase product test snapshot from the question bank."""
        from backend.services.product_test_orchestration import (
            build_product_test_snapshot,
            resolve_brands_from_survey_data,
        )

        pt_col = db.get_collection("product_test_questions")
        pkg_col = db.get_collection("package_test_questions")

        all_pt_questions = await pt_col.find({}).sort("order", 1).to_list(length=500)
        all_pkg_questions = await pkg_col.find({}).sort("order", 1).to_list(length=500)

        brand_context = resolve_brands_from_survey_data(survey_data or {}) if survey_data else None
        if brand_context and not brand_context.get("brands"):
            brand_context = None

        return build_product_test_snapshot(
            pt_config,
            all_pt_questions,
            all_pkg_questions,
            language,
            brand_context=brand_context,
        )

    async def compose_product_test_layer(self, pt_config: Dict[str, Any], language: str) -> List[Dict[str, Any]]:
        """Legacy flat sections — prefer compose_product_test_snapshot for new code."""
        snapshot = await self.compose_product_test_snapshot(pt_config, language)
        sections: List[Dict[str, Any]] = []
        for phase in snapshot.get("phases") or []:
            for section in phase.get("sections") or []:
                sections.append({
                    "title": section.get("title"),
                    "module": section.get("module"),
                    "questions": section.get("questions") or [],
                })
        return sections

    def generate_configurable_layer(self, module: Dict[str, Any], mod_config: Dict[str, Any], language: str, fallback_category: str, module_type_id: str) -> List[Dict[str, Any]]:
        target_brand = mod_config.get("target_brand") or ""
        category = target_brand if target_brand else (mod_config.get("category_name") or fallback_category or "Category")
        
        selected_q_ids = mod_config.get("selected_questions") # List of question_ids or None (if all)

        sections = []
        for section in sorted(module.get("sections", []), key=lambda s: s.get("order", 0)):
            questions = []
            for q in sorted(section.get("questions", []), key=lambda q: q.get("order", 0)):
                # If selection is enabled, filter
                if selected_q_ids is not None and q["question_id"] not in selected_q_ids:
                    continue

                raw_text = q.get("ar_text") if language == 'ar' and q.get("ar_text") else q.get("en_text", "")
                questions.append({
                    "id": q["question_id"],
                    "text": self.format_text(raw_text, product=category, category=category, brand=target_brand),
                    "type": "text" if q["type"] in ["open_loop", "open_single"] else q["type"],
                    "required": q.get("required", True),
                    "questionMeta": {
                        "nature": "fixed",
                        "section": section.get("section_id"),
                        "analytical_role": q.get("analytical_role"),
                        "brandPipeline": q.get("brand_pipeline"),
                        "hasStop": q.get("has_stop"),
                        "hasOther": q.get("has_other"),
                    }
                })
            
            if questions:
                sections.append({
                    "title": section.get("title_ar" if language == 'ar' else "title_en") or section.get("title_en"),
                    "module": module_type_id,
                    "section_id": section.get("section_id"),
                    "questions": questions
                })
        
        return sections

    async def compose_brand_analyzer_layer(self, ba_config: Dict[str, Any], language: str, category: str, pf_active: bool, survey_brands: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        is_ar = language == 'ar'
        sections = []
        
        # 1. Aided Awareness (Consolidated Logic)
        sync_pf = ba_config.get("sync_with_purchase_funnel", True)
        if not (sync_pf and pf_active):
            brands = ba_config.get("brand_list")
            if not brands and survey_brands:
                brands = survey_brands
            
            brand_options = [b.get("name") for b in (brands or []) if b.get("name")]
            
            if brand_options:
                formatted_options = [
                    {
                        "value": b,
                        "en_label": b,
                        "ar_label": b,
                        "order": i + 1
                    }
                    for i, b in enumerate(brand_options)
                ]
                sections.append({
                    "title": "الوعي بالعلامة التجارية" if is_ar else "Brand Awareness",
                    "module": "brand_analyzer",
                    "questions": [{
                        "id": "ba_q1_awareness",
                        "text": self.format_text("اختاري كل الماركات اللي تعرفيها:" if is_ar else "Please select all the brands that you are aware of:", category=category),
                        "type": "mcq",
                        "options": formatted_options,
                        "required": True,
                        "questionMeta": {
                            "inputType": "checkbox",
                            "analytical_role": "aided_awareness"
                        }
                    }]
                })

        # 2. Perception Grid (Advanced UI Structure)
        selected_attr_ids = ba_config.get("selected_attributes", [])
        if selected_attr_ids:
            # Resolve attribute labels from the bank
            col = db.get_collection("brand_attribute_banks")
            bank = await col.find_one({"is_global": True})
            
            resolved_rows = []
            if bank:
                bank_attrs = {a["id"]: a for a in bank.get("attributes", [])}
                for aid in selected_attr_ids:
                    attr = bank_attrs.get(aid)
                    if attr:
                        label = attr.get("label_ar" if is_ar else "label_en")
                        resolved_rows.append({"id": aid, "label": label})
                    else:
                        # Fallback to ID if not found in bank
                        resolved_rows.append({"id": aid, "label": aid})
            else:
                resolved_rows = [{"id": aid, "label": aid} for aid in selected_attr_ids]

            sections.append({
                 "title": "تصور العلامة التجارية" if is_ar else "Brand Perception",
                 "module": "brand_analyzer",
                  "questions": [{
                      "id": "ba_q2_perception",
                      "text": self.format_text("بالنسبة لكل جملة قدامك، اختاري البراند أو البراندات اللي ينطبق عليها الكلام. ممكن تختاري براند واحد أو أكتر لكل جملة." if is_ar else "For each statement, select the brand(s) you feel it applies to. You may choose one or more brands per statement.", category=category),
                      "type": "grid",
                      "required": True,
                      "brand_pipeline": {
                          "mode": "include_prior",
                          "sources": ["pf_q1", "pf_q2", "pf_q3", "ba_q1_awareness"] if sync_pf else ["ba_q1_awareness"],
                          "strategy": "union"
                      },
                      "questionMeta": {
                          "inputType": "perception_grid",
                          "rows": resolved_rows
                      }
                  }]
            })

        # 3. Satisfaction Loop (Premium Sequential UX)
        sections.append({
            "title": "رضا العملاء" if is_ar else "Customer Satisfaction",
            "module": "brand_analyzer",
                 "questions": [{
                      "id": "ba_q3_satisfaction",
                      "text": self.format_text("الى اي مدى انتي راضية عن ماركة [brand]" if is_ar else "To what extent are you satisfied with the brand [brand]?", category=category),
                      "type": "loop",
                      "required": True,
                      "brand_pipeline": {
                          "mode": "include_prior",
                          "sources": ["pf_q1", "pf_q2", "pf_q3", "ba_q1_awareness"] if sync_pf else ["ba_q1_awareness"],
                          "strategy": "union"
                      },
                      "questionMeta": {
                          "inputType": "satisfaction_scale",
                          "scaleText": True,
                          "options": [
                              {"label": "راضية جدا" if is_ar else "Very Satisfied", "score": 5},
                              {"label": "راضية" if is_ar else "Satisfied", "score": 4},
                              {"label": "لا راضية ولا مش راضية" if is_ar else "Neither Satisfied nor Dissatisfied", "score": 3},
                              {"label": "مش راضية" if is_ar else "Dissatisfied", "score": 2},
                              {"label": "مش راضية خالص" if is_ar else "Very Dissatisfied", "score": 1}
                          ]
                      }
                 }]
        })

        return sections

orchestration_service = OrchestrationService()
