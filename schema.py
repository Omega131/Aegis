"""
AegisMirage Shared Pydantic Schema.

This is the one file everyone reads but nobody edits without telling
the other two teammates first.
"""

from __future__ import annotations
from pydantic import BaseModel, Field


class CameraEvent(BaseModel):
    camera_id: str
    window_id: str
    timestamp: str
    event_type: str
    blurred: bool


class DecoySessionEvent(BaseModel):
    session_id: str
    source_ip: str
    service: str
    failed_logins: int
    commands: list[str] = Field(default_factory=list)
    honeytoken_hit: bool
    malware_hash: str | None = None
    c2_address: str | None = None


class RouteDecision(BaseModel):
    source_ip: str
    destination: str
    score: float
    reason: str


class Campaign(BaseModel):
    campaign_id: str
    session_ids: list[str] = Field(default_factory=list)
    confidence: str
    evidence_reasons: list[str] = Field(default_factory=list)
    risk_level: str


class CaseRequest(BaseModel):
    case_id: str
    camera_id: str
    window_id: str
    campaign_id: str
    status: str
    approvals: list[str] = Field(default_factory=list)


# =============================================================================
# Change log
# =============================================================================
# Any edit after Hour 2 gets a one-line comment here and a heads-up to the
# other two teammates.
#
# - [Scaffold] Initial schema defined for Phase 1.
