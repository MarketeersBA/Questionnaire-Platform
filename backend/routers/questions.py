from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List
from backend.database import db
from backend.models import User
from backend.routers.auth import get_current_user
from backend.utils.taste_test_question_ids import (
    build_module_metadata,
    map_question_for_api,
)

router = APIRouter(prefix="/questions", tags=["questions"])

@router.get("/attributes", response_model=List[str])
async def get_main_attributes(
    current_user: User = Depends(get_current_user)
):
    """Returns the 10 unique main attributes from master questions."""
    col = db.get_collection("master_questions")
    attributes = await col.distinct("main_attribute")
    # Ensure they are sorted for consistent UI
    return sorted(attributes)

@router.get("/sub-attributes/{attribute}", response_model=List[str])
async def get_sub_attributes(
    attribute: str,
    current_user: User = Depends(get_current_user)
):
    """Returns up to 10 unique sub-attributes for a given main attribute."""
    col = db.get_collection("master_questions")
    # Find all questions for this attribute
    cursor = col.find({"main_attribute": attribute})
    questions = await cursor.to_list(length=100)
    
    sub_attrs = set()
    for q in questions:
        for sub in q.get("sub_attributes", []):
            if sub and sub.lower() != "all":
                sub_attrs.add(sub)
    
    # Return exactly up to 10 as requested
    result = sorted(list(sub_attrs))[:10]
    return result

@router.post("/fetch", response_model=Dict[str, List[Dict]])
async def fetch_questions(
    sub_attributes: List[str],
    current_user: User = Depends(get_current_user)
):
    """Fetches questions matching the provided sub-attributes."""
    col = db.get_collection("master_questions")
    # Finding questions where at least one sub_attribute matches the input list
    cursor = col.find({"sub_attributes": {"$in": sub_attributes}})
    questions = await cursor.to_list(length=200)
    
    # Group by sub-attribute for easy frontend mapping
    grouped = {}
    for sub in sub_attributes:
        # Find questions that contain this specific sub-attribute
        matches = [
            {
                "question_id": q["question_id"],
                "question_text": q["question_text"],
                "options": q["options"],
                "question_type": q["question_type"],
                "main_attribute": q["main_attribute"]
            }
            for q in questions if sub in q.get("sub_attributes", [])
        ]
        grouped[sub] = matches
    
    return grouped

@router.post("/fetch-structural", response_model=Dict[str, List[Dict]])
async def fetch_structural_questions(
    attributes: List[str],
    current_user: User = Depends(get_current_user)
):
    """
    Fetches the 3-question foundation clusters for:
    1. Main attributes in the list.
    2. A generic 'Custom' set if any attribute in the list is NOT a main attribute.
    """
    col = db.get_collection("structural_questions")
    
    # 1. Fetch main attribute clusters
    main_cursor = col.find({"main_attribute": {"$in": attributes}, "is_custom": False})
    main_questions = await main_cursor.to_list(length=100)
    
    # 2. Check if we have custom attributes (those not matching structural main attributes)
    known_main_attrs = await col.distinct("main_attribute", {"is_custom": False})
    custom_attrs = [a for a in attributes if a not in known_main_attrs]
    
    custom_questions = []
    if custom_attrs:
        custom_cursor = col.find({"is_custom": True})
        custom_questions = await custom_cursor.to_list(length=10)
        
    # Group results
    grouped = {}
    
    # Add main attribute clusters
    for attr in attributes:
        if attr in known_main_attrs:
            matches = [
                {
                    "question_id": q["question_id"],
                    "question_text": q["question_text"],
                    "question_type": q["question_type"],
                    "options": q.get("options", []),
                    "analysis_purpose": q.get("analysis_purpose")
                }
                for q in main_questions if q["main_attribute"] == attr
            ]
            grouped[attr] = matches
        else:
            # It's a custom attribute - use the custom cluster questions but tag with the attribute name
            matches = [
                {
                    "question_id": q["question_id"],
                    "question_text": q["question_text"], # Placeholder logic handled in frontend
                    "question_type": q["question_type"],
                    "options": q.get("options", []),
                    "analysis_purpose": q.get("analysis_purpose")
                }
                for q in custom_questions
            ]
            grouped[attr] = matches
            
    return grouped


@router.get("/taste-test/attributes", response_model=List[str])
async def get_taste_test_attributes(
    current_user: User = Depends(get_current_user)
):
    """Returns unique main attributes from taste_test_questions that have optional questions."""
    col = db.get_collection("taste_test_questions")
    attributes = await col.distinct("main_att", {"question_status": "optional"})
    return sorted([a for a in attributes if a])


@router.get("/taste-test/sub-attributes/{attribute}", response_model=List[str])
async def get_taste_test_sub_attributes(
    attribute: str,
    current_user: User = Depends(get_current_user)
):
    """Returns unique sub-attributes for a given taste test main attribute that have optional questions."""
    col = db.get_collection("taste_test_questions")
    cursor = col.find({"main_att": attribute, "question_status": "optional"})
    questions = await cursor.to_list(length=100)
    
    sub_attrs = set()
    for q in questions:
        sub = q.get("supp_att")
        if sub:
            sub_attrs.add(sub)
    
    return sorted(list(sub_attrs))


@router.get("/taste-test/module-metadata")
async def get_taste_test_module_metadata(
    current_user: User = Depends(get_current_user),
):
    """Return taste-test module metadata (prefix + legacy ID aliases) from the question bank."""
    col = db.get_collection("taste_test_questions")
    docs = await col.find(
        {},
        {"question_id": 1, "legacy_id": 1, "question_id_prefix": 1},
    ).to_list(length=5000)
    return build_module_metadata(docs)


@router.post("/taste-test/fetch", response_model=Dict[str, Any])
async def fetch_taste_test_questions(
    selections: Dict[str, List[str]], # { "Appearance": ["Outershape", "Size"], "Aroma": [] }
    current_user: User = Depends(get_current_user)
):
    """
    Fetches taste test questions based on selections. 
    Includes all fixed questions and optional questions matching selected sub-attributes.
    Response includes _module_metadata with question_id_prefix and legacy_id_aliases.
    """
    col = db.get_collection("taste_test_questions")

    all_docs: List[Dict[str, Any]] = []

    # 1. Fetch ALL fixed questions
    fixed_cursor = col.find({"question_status": "fixed"})
    fixed_questions = await fixed_cursor.to_list(length=100)
    all_docs.extend(fixed_questions)

    results: Dict[str, Any] = {
        "fixed": [map_question_for_api(q) for q in fixed_questions]
    }

    # 2. Fetch optional questions for each attribute/sub-attribute combination
    for main_att, supp_attrs in selections.items():
        query: Dict[str, Any] = {"main_att": main_att, "question_status": "optional"}
        if supp_attrs:
            query["supp_att"] = {"$in": supp_attrs + [None, ""]}
        else:
            query["supp_att"] = {"$in": [None, ""]}

        opt_cursor = col.find(query)
        opt_questions = await opt_cursor.to_list(length=100)
        all_docs.extend(opt_questions)
        results[main_att] = [map_question_for_api(q) for q in opt_questions]

    results["_module_metadata"] = build_module_metadata(all_docs)
    return results
