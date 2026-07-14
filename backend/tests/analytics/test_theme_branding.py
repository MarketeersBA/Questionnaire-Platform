from backend.analytics_module.pptx_builder.theme import PPTXTheme


def test_theme_uses_branding_config_defaults():
    theme = PPTXTheme()

    primary = theme.get_branding_primary()
    secondary = theme.get_branding_secondary()
    accent = theme.get_branding_accent()

    assert tuple(primary) == (0, 0, 128)
    assert tuple(secondary) == (80, 200, 120)
    assert tuple(accent) == (255, 20, 147)


def test_theme_semantic_palettes_are_available():
    theme = PPTXTheme()

    nps = theme.get_nps_palette()
    swot = theme.get_swot_palette()
    reco = theme.get_recommendation_palette()

    assert len(nps) == 3
    assert set(swot.keys()) == {"strengths", "weaknesses", "opportunities", "threats"}
    assert set(reco.keys()) == {"product", "price", "place", "promotion"}
