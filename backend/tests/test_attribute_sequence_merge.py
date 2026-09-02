"""
A custom sub-attribute added to a LIBRARY attribute must survive.

`compose_survey_schema` reconstructs `attribute_sequence` when the frontend does
not supply one. That reconstruction used to skip any custom attribute whose name
matched a library selection, so a sub-attribute an analyst added to an existing
attribute silently never reached the respondent.
"""


def _rebuild_sequence(selections, customs):
    """Mirrors the reconstruction branch in OrchestrationService."""
    sequence = []
    for main_attr, subs in selections.items():
        sequence.append(
            {"main_attribute": main_attr, "sub_attributes": list(subs), "source": "library"}
        )

    for c in customs:
        custom_main = c["main_attribute"]
        custom_labels = [s["label"] for s in c.get("sub_attributes", [])]

        if custom_main in selections:
            existing = next(
                (s for s in sequence if s["main_attribute"] == custom_main), None
            )
            if existing is not None:
                for label in custom_labels:
                    if label not in existing["sub_attributes"]:
                        existing["sub_attributes"].append(label)
                continue

        sequence.append(
            {"main_attribute": custom_main, "sub_attributes": custom_labels, "source": "custom"}
        )

    return sequence


def test_custom_sub_on_a_library_attribute_is_merged_not_dropped():
    sequence = _rebuild_sequence(
        selections={"Taste": ["Salty", "Sweet"]},
        customs=[{"main_attribute": "Taste", "sub_attributes": [{"label": "Umami"}]}],
    )

    assert len(sequence) == 1, "must not create a rival attribute"
    assert sequence[0]["sub_attributes"] == ["Salty", "Sweet", "Umami"]


def test_a_wholly_new_custom_attribute_is_still_appended():
    sequence = _rebuild_sequence(
        selections={"Taste": ["Salty"]},
        customs=[{"main_attribute": "Mouthfeel", "sub_attributes": [{"label": "Coating"}]}],
    )

    assert [s["main_attribute"] for s in sequence] == ["Taste", "Mouthfeel"]
    assert sequence[1]["source"] == "custom"


def test_duplicate_labels_are_not_added_twice():
    sequence = _rebuild_sequence(
        selections={"Taste": ["Salty"]},
        customs=[{"main_attribute": "Taste", "sub_attributes": [{"label": "Salty"}]}],
    )
    assert sequence[0]["sub_attributes"] == ["Salty"]


def test_several_custom_subs_merge_onto_one_attribute():
    sequence = _rebuild_sequence(
        selections={"After Taste": ["Longlasting"]},
        customs=[{
            "main_attribute": "After Taste",
            "sub_attributes": [{"label": "Strength"}, {"label": "Cleanliness"}],
        }],
    )
    assert sequence[0]["sub_attributes"] == ["Longlasting", "Strength", "Cleanliness"]
