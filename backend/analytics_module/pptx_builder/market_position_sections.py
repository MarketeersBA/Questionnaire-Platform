from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .narrative_pagination import chunk_sequence

ARCHETYPE_DESCRIPTIONS = {
    "Leader": "Dominant market presence with high product quality and usage velocity.",
    "Challenger": "High performance coupled with aggressive growth potential versus the market leader.",
    "Niche": "Strong performance within specialized audience segments but lower overall mass-market scale.",
    "Follower": "Steady market presence with average performance across key category drivers.",
}


@dataclass(frozen=True)
class MarketPositionSection:
    kind: str
    title: str
    body_lines: List[str] = field(default_factory=list)
    bullets: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class MarketPositionSectionBuilder:
    """Convert market_position_report payloads into explicit narrative sections."""

    @classmethod
    def from_payload(cls, payload: Any) -> List[MarketPositionSection]:
        if payload is None:
            return []

        if isinstance(payload, str):
            return [
                MarketPositionSection(
                    kind="overview",
                    title="Strategic Positioning Overview",
                    body_lines=[payload],
                )
            ]

        if not isinstance(payload, dict):
            return [
                MarketPositionSection(
                    kind="overview",
                    title="Strategic Positioning Overview",
                    body_lines=[str(payload)],
                )
            ]

        sections: List[MarketPositionSection] = []
        market_position = str(payload.get("market_position") or "Follower")
        confidence = str(payload.get("position_confidence") or "Medium")
        description = ARCHETYPE_DESCRIPTIONS.get(
            market_position,
            ARCHETYPE_DESCRIPTIONS["Follower"],
        )

        sections.append(
            MarketPositionSection(
                kind="archetype",
                title="Market Archetype Classification",
                body_lines=[description],
                metadata={
                    "market_position": market_position,
                    "position_confidence": confidence,
                },
            )
        )

        audience_profile = str(payload.get("target_audience_profile") or "").strip()
        segments = payload.get("audience_segments") or []
        if audience_profile or segments:
            sections.append(
                MarketPositionSection(
                    kind="audience_profile",
                    title="Core Audience Identity",
                    body_lines=[f'"{audience_profile}"'] if audience_profile else [],
                    metadata={"segment_count": len(segments)},
                )
            )

            for index, chunk in enumerate(chunk_sequence(segments, 3), start=1):
                lines = []
                for segment in chunk:
                    if not isinstance(segment, dict):
                        continue
                    name = segment.get("segment_name", "Segment")
                    score = segment.get("affinity_score", 0)
                    rationale = segment.get("rationale", "")
                    lines.append(f"{name} ({score:.0f} AAI): {rationale}")
                if lines:
                    sections.append(
                        MarketPositionSection(
                            kind="audience_segments",
                            title=f"Top Affinity Hubs {index}",
                            body_lines=lines,
                        )
                    )

        competitive_stance = str(payload.get("competitive_stance") or "").strip()
        if competitive_stance:
            sections.append(
                MarketPositionSection(
                    kind="competitive_stance",
                    title="Competitive Stance",
                    body_lines=[competitive_stance],
                )
            )

        implications = payload.get("strategic_implications") or []
        implication_bullets = [str(item).strip() for item in implications if str(item).strip()]
        for index, chunk in enumerate(chunk_sequence(implication_bullets, 3), start=1):
            sections.append(
                MarketPositionSection(
                    kind="strategic_implications",
                    title="Positioning Imperatives" if index == 1 else f"Positioning Imperatives {index}",
                    bullets=chunk,
                )
            )

        return sections

    @staticmethod
    def section_count(payload: Any) -> int:
        return len(MarketPositionSectionBuilder.from_payload(payload))
