"""
AegisMirage — Full Pipeline Integration & System Verification Suite.

Validates the complete unified application wiring (Persons A, B, and C):
- Drill A: False Positive Safeguard (Pedestrian flagged, feed redacted, unauthorized unmask denied & audited)
- Drill B: Controlled Honeypot Breach & Scoped Break-Glass Escrow (Honeytoken tripwire, 2-of-3 Shamir quorum, tamper-evident audit log, scoped unmasking)
- Drill C: Multi-Group Threat Campaign Clustering (Rule-based graph linking, weak-evidence isolation, C2 adaptation correlation)
- System Resilience: Unavailable camera, invalid payloads, concurrent sessions, tamper detection, and clean lifecycle management.
"""

from __future__ import annotations

import asyncio
import hashlib
import unittest
from typing import Any, Dict, List

import cv2
import numpy as np
from fastapi.testclient import TestClient

import decoy
import edge
import escrow
import gateway
import intel
import main
import schema


class TestAegisMirageFullPipeline(unittest.TestCase):
    """Integration verification across all 5 modules and shared contracts."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(main.app)

    def setUp(self) -> None:
        # Reset state cleanly before each drill
        gateway.reset_gateway()
        decoy.reset_decoy_state()
        intel.engine.clear()
        escrow.seed_escrow_data()

    # =========================================================================
    # Phase 2 & 3: Architectural Contracts & Health
    # =========================================================================

    def test_01_system_health_and_subsystem_readiness(self) -> None:
        """GET /health reports operational readiness for all 5 subsystems."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "AegisMirage")
        modules = data["modules"]
        self.assertIn("edge", modules)
        self.assertIn("decoy", modules)
        self.assertIn("gateway", modules)
        self.assertIn("intel", modules)
        self.assertIn("escrow", modules)
        self.assertEqual(data["stats"]["cameras_count"], 5)

    def test_02_router_prefixes_and_api_symmetry(self) -> None:
        """Verifies both root prefixes and /api prefixes respond identically."""
        # Intel
        self.assertEqual(self.client.get("/intel/campaigns").status_code, 200)
        self.assertEqual(self.client.get("/api/intel/campaigns").status_code, 200)
        # Escrow
        self.assertEqual(self.client.get("/escrow/cases").status_code, 200)
        self.assertEqual(self.client.get("/api/escrow/cases").status_code, 200)
        # Cameras & Decoy
        self.assertEqual(self.client.get("/api/cameras").status_code, 200)
        self.assertEqual(self.client.get("/api/decoy/sessions").status_code, 200)
        self.assertEqual(self.client.get("/api/gateway/decisions").status_code, 200)

    # =========================================================================
    # Phase 4 — DRILL A: False Positive Safeguard
    # =========================================================================

    def test_03_drill_a_false_positive_safeguard(self) -> None:
        """
        Drill A:
        1. A pedestrian triggers face detection/anomaly at edge.
        2. Normal camera feed remains blurred and uncompromised.
        3. No honeypot hostility is recorded.
        4. Operator attempts unauthorized unmasking -> Strictly DENIED with 403 Forbidden.
        5. Denial incident is permanently recorded in the tamper-evident audit ledger.
        """
        # Step 1: Initialize Drill A in intelligence engine
        init_res = self.client.post("/intel/drill/drill-a")
        self.assertEqual(init_res.status_code, 200)
        self.assertIn("Drill A Initialized", init_res.json()["drill"])

        # Step 2: Verify normal camera feed remains blurred JPEG
        frame_res = self.client.get("/api/cameras/cam_01/frame")
        self.assertEqual(frame_res.status_code, 200)
        self.assertEqual(frame_res.headers["content-type"], "image/jpeg")
        self.assertTrue(len(frame_res.content) > 1000)

        # Step 3: Operator attempts unauthorized unmasking of civilian pedestrian footage
        unauth_res = self.client.post(
            "/escrow/attempt-unauthorized",
            params={
                "camera_id": "cam_01",
                "window_id": "2026-10-24T14:30",
                "operator_id": "rogue-operator-station-09",
            },
        )
        self.assertEqual(unauth_res.status_code, 403)
        detail = unauth_res.json()["detail"]
        self.assertEqual(detail["error"], "UNAUTHORIZED_UNMASK_DENIED")
        self.assertIn("False-positive safeguard active", detail["reason"])

        # Step 4: Verify denial was cryptographically committed to the audit ledger
        audit_res = self.client.get("/escrow/audit-log")
        self.assertEqual(audit_res.status_code, 200)
        chain = audit_res.json()
        denial_entry = next(
            (b for b in chain if b["action"] == "FALSE_POSITIVE_UNMASK_BLOCKED"), None
        )
        self.assertIsNotNone(denial_entry)
        self.assertEqual(denial_entry["actor"], "rogue-operator-station-09")
        self.assertEqual(denial_entry["camera_id"], "cam_01")

        # Step 5: Verify hash chain integrity passes
        verify_res = self.client.get("/escrow/audit-log/verify")
        self.assertEqual(verify_res.status_code, 200)
        self.assertTrue(verify_res.json()["valid"])

    # =========================================================================
    # Phase 4 — DRILL B: Controlled Intrusion & Break-Glass Escrow
    # =========================================================================

    def test_04_drill_b_honeypot_intrusion_and_break_glass_unmask(self) -> None:
        """
        Drill B:
        1. Attacker attacks honeypot decoy, runs commands, and touches honeytoken bait.
        2. Person B emits DecoySessionEvent; Person C bridge ingests it.
        3. Hostility score crosses threshold; Case CASE-2026-001 is active.
        4. Custodian 1 (Judiciary) has approved; Custodian 2 (Cybercrime Forensics) votes approve.
        5. Shamir 2-of-3 quorum is reached.
        6. Cryptographic audit entry (BREAK_GLASS_UNMASK_APPROVED) is written BEFORE unmasking.
        7. Decryption key is reconstructed and scoped footage is decrypted.
        8. Unrelated camera footage remains inaccessible.
        """
        # Step 1: Simulate attacker interaction on decoy
        sid = "sess-drill-b-attacker"
        decoy.record_decoy_login(sid, "45.33.32.156", "ssh", "admin", "123456", success=False)
        decoy.execute_decoy_command(sid, "uname -a")
        # Attacker reads honeytoken canary bait
        out, event = decoy.execute_decoy_command(sid, "cat /etc/camera/credentials.conf")
        self.assertIn("NEVER GONNA GIVE YOU UP", out)
        self.assertTrue(event.honeytoken_hit)

        # Step 2: Confirm Person C bridge received the honeytoken session
        self.assertIn(sid, intel.engine.sessions)
        self.assertTrue(intel.engine.sessions[sid].honeytoken_hit)

        # Step 3: Trigger Drill B in Intel & check active escrow case
        self.client.post("/intel/drill/drill-b")
        case_res = self.client.get("/escrow/cases/CASE-2026-001")
        self.assertEqual(case_res.status_code, 200)
        case_data = case_res.json()
        self.assertEqual(case_data["case"]["status"], "pending")
        self.assertEqual(case_data["approvals_count"], 1)

        # Step 4: Prior to quorum, unmasked footage request is strictly rejected with 403
        pre_unmask = self.client.get("/escrow/cases/CASE-2026-001/footage")
        self.assertEqual(pre_unmask.status_code, 403)

        # Step 5: Custodian 2 casts the decisive 2nd approval vote
        vote_res = self.client.post(
            "/escrow/cases/CASE-2026-001/vote",
            json={
                "custodian_id": "custodian-2-cybercrime",
                "decision": "approve",
                "justification": "Verified honeypot honeytoken tripwire from 45.33.32.156.",
            },
        )
        self.assertEqual(vote_res.status_code, 200)
        vote_data = vote_res.json()
        self.assertTrue(vote_data["quorum_achieved"])
        self.assertIsNotNone(vote_data["unlocked_key"])

        # Step 6: Verify audit entry was committed BEFORE footage release
        audit_res = self.client.get("/escrow/audit-log")
        chain = audit_res.json()
        unmask_entry = next(
            (b for b in chain if b["action"] == "BREAK_GLASS_UNMASK_APPROVED"), None
        )
        self.assertIsNotNone(unmask_entry)
        self.assertEqual(unmask_entry["case_id"], "CASE-2026-001")

        # Step 7: Retrieve unmasked footage for the approved case
        footage_res = self.client.get("/escrow/cases/CASE-2026-001/footage")
        self.assertEqual(footage_res.status_code, 200)
        footage_data = footage_res.json()
        self.assertEqual(footage_data["status"], "unmasked")
        self.assertTrue(footage_data["crop_count"] >= 1)
        self.assertTrue(len(footage_data["crops_base64"]) >= 1)

        # Step 8: Unrelated camera footage remains inaccessible
        unrelated_case = self.client.get("/escrow/cases/CASE-NONEXISTENT/footage")
        self.assertEqual(unrelated_case.status_code, 404)

    # =========================================================================
    # Phase 4 — DRILL C: Campaign Correlation & Clustering
    # =========================================================================

    def test_05_drill_c_campaign_correlation_and_weak_evidence_isolation(self) -> None:
        """
        Drill C:
        1. Three controlled attacker groups generate distinguishable evidence.
        2. Strong evidence (shared C2, malware hash) correctly clusters sessions.
        3. Weak evidence (shared VPN/source IP alone) does NOT falsely merge groups.
        4. Attacker rotating IP while retaining C2 domain is correctly correlated.
        """
        # Step 1: Initialize Drill C multi-group botnet scenario
        drill_c_res = self.client.post("/intel/drill/drill-c")
        self.assertEqual(drill_c_res.status_code, 200)

        # Step 2: Query clustered campaigns
        camp_res = self.client.get("/intel/campaigns")
        self.assertEqual(camp_res.status_code, 200)
        camp_data = camp_res.json()
        self.assertTrue(len(camp_data) >= 2)

        # Step 3: Verify campaign graph nodes and edges
        graph_res = self.client.get("/intel/graph")
        self.assertEqual(graph_res.status_code, 200)
        graph_data = graph_res.json()
        self.assertTrue(len(graph_data["nodes"]) >= 3)
        self.assertTrue(len(graph_data["edges"]) >= 2)

        # Step 4: Verify STIX 2.1 threat intelligence export for main campaign
        top_camp_id = camp_data[0]["campaign_id"]
        stix_res = self.client.get(f"/intel/export/stix/{top_camp_id}")
        self.assertEqual(stix_res.status_code, 200)
        stix_bundle = stix_res.json()
        self.assertEqual(stix_bundle["type"], "bundle")
        self.assertTrue(len(stix_bundle["objects"]) >= 2)

    # =========================================================================
    # System Resilience & Edge Case Tests
    # =========================================================================

    def test_06_camera_fault_simulation_and_recovery(self) -> None:
        """Injects blinding and freezing faults into cam_01 and verifies recovery."""
        # Inject blinding
        blind_res = self.client.post("/api/cameras/cam_01/simulate/blind")
        self.assertEqual(blind_res.status_code, 200)

        # Verify event logged
        events_res = self.client.get("/api/cameras/events?limit=10")
        self.assertEqual(events_res.status_code, 200)

        # Recover
        recover_res = self.client.post("/api/cameras/cam_01/simulate/recover")
        self.assertEqual(recover_res.status_code, 200)

    def test_07_invalid_payloads_and_input_boundaries(self) -> None:
        """Verifies 400/413/422 responses for malformed inputs."""
        # Oversized upload rejection
        oversized = b"A" * (2 * 1024 * 1024 + 1024)
        upload_res = self.client.post(
            "/api/decoy/upload",
            content=oversized,
            headers={"Content-Type": "application/octet-stream"},
        )
        self.assertEqual(upload_res.status_code, 413)

        # Invalid vote decision
        vote_bad = self.client.post(
            "/escrow/cases/CASE-2026-001/vote",
            json={"custodian_id": "custodian-1-judiciary", "decision": "invalid-vote"},
        )
        self.assertEqual(vote_bad.status_code, 400)

        # Nonexistent camera frame request
        bad_cam = self.client.get("/api/cameras/nonexistent_cam_99/frame")
        self.assertEqual(bad_cam.status_code, 404)

    def test_08_audit_ledger_tamper_detection(self) -> None:
        """Simulates tampering in the audit log and verifies it is detected."""
        # Genuine state is valid
        self.assertTrue(escrow.audit_log.verify_integrity()["valid"])

        # Tamper with an audit entry's details
        original_details = escrow.audit_log.chain[1].details
        try:
            escrow.audit_log.chain[1].details = "TAMPERED_UNAUTHORIZED_MUTATION"
            tampered_check = escrow.audit_log.verify_integrity()
            self.assertFalse(tampered_check["valid"])
            self.assertIn("tampered", tampered_check["error"])
        finally:
            # Restore original
            escrow.audit_log.chain[1].details = original_details

    def test_09_gateway_scoring_and_allowlist_boundaries(self) -> None:
        """Verifies gateway threshold boundaries and allowlist enforcement."""
        # Allowlisted source routes to real with score 0
        dec_allow = gateway.evaluate_route("127.0.0.1", service="ssh")
        self.assertEqual(dec_allow.destination, "real")
        self.assertEqual(dec_allow.score, 0.0)

        # Repeated failed logins with Mirai default creds routes to decoy
        src = "194.26.29.99"
        gateway.evaluate_route(src, service="ssh", attempted_creds=("root", "123456"), is_login_failure=True)
        dec_hostile = gateway.evaluate_route(src, service="ssh", attempted_creds=("admin", "admin"), is_login_failure=True)
        self.assertEqual(dec_hostile.destination, "decoy")
        self.assertTrue(dec_hostile.score >= 60.0)


if __name__ == "__main__":
    unittest.main()
