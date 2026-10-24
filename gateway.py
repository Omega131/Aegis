"""
AegisMirage Gateway Routing Engine.

Owner: Member B — routing logic (real vs decoy)
Stage: Stage 2 (Phantom Twin Gateway)

Architecture & Connection Routing Design:
------------------------------------------
1. Decision vs. Enforcement:
   - Computing a RouteDecision: Evaluates an incoming source using transport-observed
     telemetry, historical state, and threat heuristics to yield:
       RouteDecision(source_ip, destination, score, reason)
   - Enforcing a RouteDecision: Dispatches the physical request or connection to an
     injectable handler (real device handler, decoy handler, or rate-limiter).
     NOTE: Returning destination="real" only decides the path; it does NOT forward
     network packets by itself. Handler dispatch enforces the actual routing.

2. Web vs. SSH Routing Behavior:
   - Web (HTTP/HTTPS):
     Routing can occur per-request or per-session. The gateway inspects the incoming
     HTTP request, evaluates the route, and forwards to the real camera web UI,
     the fake decoy admin portal, or returns HTTP 429 (Too Many Requests).
   - SSH (Connection-Time Routing):
     SSH establishes a secure, encrypted transport during the initial cryptographic
     handshake with a specific server host key. It is cryptographically impossible
     to "transparently move" an established, encrypted SSH session between servers
     mid-stream without terminating the TCP session.
     Therefore, SSH routing MUST occur at CONNECTION TIME (e.g. before or at the start
     of the TCP connection/authentication phase via port redirection or TCP proxying).

3. Security Model:
   - Transport-Observed Source Addresses: The gateway relies solely on the peer
     IP observed at the TCP transport layer. Client-provided headers (such as
     X-Forwarded-For or X-Real-IP) are untrusted and rejected by default to prevent
     forged allowlist bypasses.
   - Allowlisting Scope: Allowlisted sources bypass honeypot decoys and route to the
     real camera subsystem. However, allowlisting only determines the network destination;
     it does NOT bypass real-device authentication. The real device still verifies
     credentials independently.
   - Fail-Safe Default: Uncertain reconnaissance (scores between 20.0 and 59.9) routes
     to "rate_limit", never silently trapping a legitimate user in a decoy.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import schema


# =============================================================================
# Gateway Configuration
# =============================================================================

@dataclass
class GatewayConfig:
    """Configurable scoring rules, thresholds, and limits for the gateway."""
    # Scoring weights
    failed_login_penalty: float = 15.0
    default_creds_penalty: float = 50.0
    service_probe_penalty: float = 15.0

    # Routing thresholds
    threshold_real_max: float = 20.0       # score < 20.0 -> "real"
    threshold_decoy_min: float = 60.0      # score >= 60.0 -> "decoy"
    # 20.0 <= score < 60.0 -> "rate_limit" (fail-safe default)

    # State bounds & expiration (TTL)
    session_ttl_seconds: float = 300.0     # 5 minutes expiry for inactive sources
    max_tracked_sources: int = 1000        # Maximum source records retained in memory

    # Security settings
    trust_forwarded_headers: bool = False  # Reject X-Forwarded-For by default

    # Allowlist: IPs that always route to the real device
    allowlist: Set[str] = field(default_factory=lambda: {
        "127.0.0.1",
        "::1",
        "10.0.0.50",     # Field technician workstation
        "192.168.1.10",  # Command Center operations console
    })

    # Known IoT / Mirai demo default credentials
    common_default_credentials: Set[Tuple[str, str]] = field(default_factory=lambda: {
        ("admin", "admin"),
        ("admin", "1234"),
        ("admin", "12345"),
        ("admin", "123456"),
        ("admin", "password"),
        ("root", "root"),
        ("root", "admin"),
        ("root", "123456"),
        ("root", "xc3511"),
        ("root", "vizxv"),
        ("root", "pass"),
        ("default", "default"),
        ("user", "user"),
        ("support", "support"),
    })


# =============================================================================
# Per-Source Bounded State
# =============================================================================

@dataclass
class SourceRecord:
    """Tracks state and threat history for a single observed source IP."""
    source_ip: str
    first_seen: float
    last_seen: float
    score: float = 0.0
    failed_logins: int = 0
    services_touched: Set[str] = field(default_factory=set)
    sticky_destination: Optional[str] = None

    def is_expired(self, current_time: float, ttl_seconds: float) -> bool:
        """Check if this source's record has expired due to inactivity."""
        return (current_time - self.last_seen) > ttl_seconds


# =============================================================================
# Injectable Handlers & Test Fixtures
# =============================================================================

class LocalMockRealDeviceFixture:
    """
    Clearly labelled local test fixture simulating a physical IoT Camera.
    Used when the real device target is unavailable during demos or testing.
    """
    def __init__(self, target_name: str = "Simulated-Camera-01") -> None:
        self.target_name = target_name
        self.invocations: List[Dict[str, Any]] = []

    def __call__(self, context: Dict[str, Any]) -> Dict[str, Any]:
        record = {
            "handler": "LocalMockRealDeviceFixture",
            "target": self.target_name,
            "status": "PASS_THROUGH_DELIVERED",
            "timestamp": time.time(),
            "context": context,
        }
        self.invocations.append(record)
        return record


class LocalMockDecoyHandler:
    """Test fixture simulating redirection into the Phantom Twin decoy sandbox."""
    def __init__(self) -> None:
        self.invocations: List[Dict[str, Any]] = []

    def __call__(self, context: Dict[str, Any]) -> Dict[str, Any]:
        record = {
            "handler": "LocalMockDecoyHandler",
            "status": "TRAPPED_IN_DECOY",
            "timestamp": time.time(),
            "context": context,
        }
        self.invocations.append(record)
        return record


class LocalMockRateLimitHandler:
    """Test fixture simulating rate limiting / connection throttling."""
    def __init__(self) -> None:
        self.invocations: List[Dict[str, Any]] = []

    def __call__(self, context: Dict[str, Any]) -> Dict[str, Any]:
        record = {
            "handler": "LocalMockRateLimitHandler",
            "status": "THROTTLED_429",
            "timestamp": time.time(),
            "context": context,
        }
        self.invocations.append(record)
        return record


# =============================================================================
# Gateway Router Class
# =============================================================================

class GatewayRouter:
    """
    Main Gateway class managing threat scoring, sticky routing,
    bounded per-source state, and handler dispatch.
    """

    def __init__(self, config: Optional[GatewayConfig] = None) -> None:
        self.config = config or GatewayConfig()
        self.sources: Dict[str, SourceRecord] = {}
        self.decision_history: List[schema.RouteDecision] = []

        # Injectable handlers
        self.real_handler: Callable[[Dict[str, Any]], Any] = LocalMockRealDeviceFixture()
        self.decoy_handler: Callable[[Dict[str, Any]], Any] = LocalMockDecoyHandler()
        self.rate_limit_handler: Callable[[Dict[str, Any]], Any] = LocalMockRateLimitHandler()

    def reset(self) -> None:
        """Clear all active state, records, and history, and restore default handlers."""
        self.sources.clear()
        self.decision_history.clear()
        self.real_handler = LocalMockRealDeviceFixture()
        self.decoy_handler = LocalMockDecoyHandler()
        self.rate_limit_handler = LocalMockRateLimitHandler()

    # -------------------------------------------------------------------------
    # State Hygiene & Expiry
    # -------------------------------------------------------------------------

    def _cleanup_expired_sources(self, now: float) -> None:
        """Prune records that have exceeded their TTL."""
        expired_ips = [
            ip for ip, record in self.sources.items()
            if record.is_expired(now, self.config.session_ttl_seconds)
        ]
        for ip in expired_ips:
            del self.sources[ip]

    def _enforce_capacity(self) -> None:
        """Ensure total tracked sources do not exceed max_tracked_sources (LRU-like eviction)."""
        while len(self.sources) > self.config.max_tracked_sources:
            oldest_ip = min(self.sources.keys(), key=lambda ip: self.sources[ip].last_seen)
            del self.sources[oldest_ip]

    def _get_or_create_source(self, source_ip: str, now: float) -> SourceRecord:
        """Retrieve existing source record (resetting if expired) or create new."""
        self._cleanup_expired_sources(now)

        if source_ip in self.sources:
            record = self.sources[source_ip]
            if record.is_expired(now, self.config.session_ttl_seconds):
                # Expired: re-initialize state
                record = SourceRecord(source_ip=source_ip, first_seen=now, last_seen=now)
                self.sources[source_ip] = record
            else:
                record.last_seen = now
            return record

        record = SourceRecord(source_ip=source_ip, first_seen=now, last_seen=now)
        self.sources[source_ip] = record
        self._enforce_capacity()
        return record

    # -------------------------------------------------------------------------
    # Transport Source Address Extraction
    # -------------------------------------------------------------------------

    def extract_source_ip(
        self,
        transport_peer_ip: str,
        forwarded_header: Optional[str] = None,
    ) -> str:
        """
        Derives the authoritative source IP.
        By default, client-supplied headers (e.g. X-Forwarded-For) are untrusted
        and rejected. Only transport-observed peer IPs are accepted.
        """
        if self.config.trust_forwarded_headers and forwarded_header:
            # Only if explicitly configured to sit behind a trusted reverse proxy
            client_ip = forwarded_header.split(",")[0].strip()
            if client_ip:
                return client_ip

        # Always default to transport-observed TCP peer
        return transport_peer_ip.strip()

    # -------------------------------------------------------------------------
    # Step 1: Computing a RouteDecision
    # -------------------------------------------------------------------------

    def compute_route_decision(
        self,
        source_ip: str,
        service: str = "ssh",
        attempted_creds: Optional[Tuple[str, str]] = None,
        is_login_failure: bool = False,
        now: Optional[float] = None,
    ) -> schema.RouteDecision:
        """
        Evaluates the source IP against allowlists, threat heuristics, and thresholds.
        Returns a typed schema.RouteDecision without executing handlers.
        """
        current_time = now if now is not None else time.time()
        record = self._get_or_create_source(source_ip, current_time)

        # 1. Allowlist Check
        # Note: Allowlisting routes to the real device, but does NOT bypass real-device authentication!
        if source_ip in self.config.allowlist:
            reason = "Trusted source IP in gateway allowlist (routes to real device; requires valid auth)"
            decision = schema.RouteDecision(
                source_ip=source_ip,
                destination="real",
                score=0.0,
                reason=reason,
            )
            self.decision_history.append(decision)
            record.sticky_destination = "real"
            return decision

        # 2. Calculate New Threat Evidence Delta
        delta = 0.0
        reasons: List[str] = []

        # Service probing check
        if service not in record.services_touched:
            record.services_touched.add(service)
            if len(record.services_touched) > 1:
                delta += self.config.service_probe_penalty
                reasons.append(f"Distinct services touched: {', '.join(sorted(record.services_touched))}")

        # Default IoT / Mirai credentials check
        if attempted_creds is not None:
            user, pwd = attempted_creds
            if (user.lower(), pwd.lower()) in self.config.common_default_credentials:
                delta += self.config.default_creds_penalty
                reasons.append(f"Known IoT default credentials probe ({user}:{pwd})")

        # Failed authentication check
        if is_login_failure:
            record.failed_logins += 1
            delta += self.config.failed_login_penalty
            reasons.append(f"Failed login attempt #{record.failed_logins}")

        # Update cumulative score
        record.score += delta
        current_score = record.score

        # 3. Sticky Routing & Escalation Logic
        # If an established destination exists, check if new evidence causes an escalation
        if record.sticky_destination is not None:
            existing_dest = record.sticky_destination

            # An IP initially on 'real' or 'rate_limit' escalates if new evidence crosses thresholds
            if existing_dest in ("real", "rate_limit") and current_score >= self.config.threshold_decoy_min:
                record.sticky_destination = "decoy"
                reason_str = (
                    f"Escalated from {existing_dest} to decoy (Score: {current_score:.1f} >= {self.config.threshold_decoy_min}): "
                    + (", ".join(reasons) if reasons else "High cumulative threat score")
                )
            elif existing_dest == "real" and current_score >= self.config.threshold_real_max:
                record.sticky_destination = "rate_limit"
                reason_str = (
                    f"Escalated from real to rate-limit (Score: {current_score:.1f} >= {self.config.threshold_real_max}): "
                    + (", ".join(reasons) if reasons else "Borderline threat score")
                )
            else:
                # Maintain sticky path
                reason_str = f"Sticky route active ({existing_dest})"
                if reasons:
                    reason_str += f" | New evidence: {', '.join(reasons)}"

            decision = schema.RouteDecision(
                source_ip=source_ip,
                destination=record.sticky_destination,
                score=round(current_score, 2),
                reason=reason_str,
            )
            self.decision_history.append(decision)
            return decision

        # 4. Initial Threshold Evaluation
        if current_score >= self.config.threshold_decoy_min:
            destination = "decoy"
            reason_str = (
                f"Hostile threshold crossed ({current_score:.1f} >= {self.config.threshold_decoy_min}): "
                + (", ".join(reasons) if reasons else "High threat profile")
            )
        elif current_score >= self.config.threshold_real_max:
            # FAIL-SAFE DEFAULT: Uncertain cases are rate-limited, never silently sent to decoy
            destination = "rate_limit"
            reason_str = (
                f"Fail-safe rate limit applied ({current_score:.1f} pts in [{self.config.threshold_real_max}, {self.config.threshold_decoy_min})): "
                + (", ".join(reasons) if reasons else "Uncertain reconnaissance pattern")
            )
        else:
            destination = "real"
            reason_str = f"Low risk traffic ({current_score:.1f} pts < {self.config.threshold_real_max}): Clean probe"

        # Lock sticky routing
        record.sticky_destination = destination

        decision = schema.RouteDecision(
            source_ip=source_ip,
            destination=destination,
            score=round(current_score, 2),
            reason=reason_str,
        )
        self.decision_history.append(decision)
        return decision

    # -------------------------------------------------------------------------
    # Step 2: Enforcing the RouteDecision
    # -------------------------------------------------------------------------

    def enforce_route(
        self,
        decision: schema.RouteDecision,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Dispatches the connection or request to the appropriate handler.
        Never claim that returning destination='real' forwards network traffic;
        the registered handler must perform the actual dispatch.
        """
        ctx = context or {}
        ctx["source_ip"] = decision.source_ip
        ctx["decision_destination"] = decision.destination
        ctx["score"] = decision.score

        if decision.destination == "real":
            handler_result = self.real_handler(ctx)
            selected_handler = "real_handler"
        elif decision.destination == "decoy":
            handler_result = self.decoy_handler(ctx)
            selected_handler = "decoy_handler"
        elif decision.destination == "rate_limit":
            handler_result = self.rate_limit_handler(ctx)
            selected_handler = "rate_limit_handler"
        else:
            raise ValueError(f"Unknown route destination: {decision.destination}")

        return {
            "decision": decision,
            "selected_handler": selected_handler,
            "handler_result": handler_result,
        }

    def handle_connection(
        self,
        transport_peer_ip: str,
        service: str = "ssh",
        attempted_creds: Optional[Tuple[str, str]] = None,
        is_login_failure: bool = False,
        forwarded_header: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        End-to-end convenience method:
        1. Derives authoritative transport source IP.
        2. Computes the RouteDecision.
        3. Enforces the decision by executing the corresponding handler.
        """
        authoritative_ip = self.extract_source_ip(transport_peer_ip, forwarded_header)
        decision = self.compute_route_decision(
            source_ip=authoritative_ip,
            service=service,
            attempted_creds=attempted_creds,
            is_login_failure=is_login_failure,
        )
        return self.enforce_route(decision, context)


# Single module instance for single-process backend
_router = GatewayRouter()


# =============================================================================
# Public Functional API
# =============================================================================

def evaluate_route(
    source_ip: str,
    service: str = "ssh",
    attempted_creds: Optional[Tuple[str, str]] = None,
    is_login_failure: bool = False,
    now: Optional[float] = None,
) -> schema.RouteDecision:
    """Compute a RouteDecision for the given source IP."""
    return _router.compute_route_decision(
        source_ip=source_ip,
        service=service,
        attempted_creds=attempted_creds,
        is_login_failure=is_login_failure,
        now=now,
    )


def enforce_route(
    decision: schema.RouteDecision,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute the configured handler for the computed RouteDecision."""
    return _router.enforce_route(decision, context)


def handle_request(
    transport_peer_ip: str,
    service: str = "web",
    attempted_creds: Optional[Tuple[str, str]] = None,
    is_login_failure: bool = False,
    forwarded_header: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """End-to-end extraction, decision computation, and handler enforcement."""
    return _router.handle_connection(
        transport_peer_ip=transport_peer_ip,
        service=service,
        attempted_creds=attempted_creds,
        is_login_failure=is_login_failure,
        forwarded_header=forwarded_header,
        context=context,
    )


def set_real_device_handler(handler: Callable[[Dict[str, Any]], Any]) -> None:
    """Inject a custom handler for real device connections."""
    _router.real_handler = handler


def set_decoy_handler(handler: Callable[[Dict[str, Any]], Any]) -> None:
    """Inject a custom handler for decoy connections."""
    _router.decoy_handler = handler


def set_rate_limit_handler(handler: Callable[[Dict[str, Any]], Any]) -> None:
    """Inject a custom handler for rate limited connections."""
    _router.rate_limit_handler = handler


def reset_gateway() -> None:
    """Reset the module's router state."""
    _router.reset()


def get_all_decisions() -> List[schema.RouteDecision]:
    """Retrieve all recorded route decisions."""
    return list(_router.decision_history)


def get_gateway_summary() -> Dict[str, Any]:
    """Export summary metrics for the dashboard."""
    counts = {"real": 0, "rate_limit": 0, "decoy": 0}
    for record in _router.sources.values():
        dest = record.sticky_destination
        if dest in counts:
            counts[dest] += 1

    return {
        "tracked_sources": len(_router.sources),
        "destinations": counts,
        "allowlist_count": len(_router.config.allowlist),
        "recent_decisions": [d.model_dump() for d in _router.decision_history[-10:]],
    }


# =============================================================================
# Standalone Self-Test Block
# =============================================================================

if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("AegisMirage — Gateway Module Standalone Self-Test (Member B)")
    print("=" * 65)

    reset_gateway()

    # 1. Allowlisted source -> real path
    res_allow = evaluate_route("127.0.0.1", service="ssh")
    assert res_allow.destination == "real"
    assert res_allow.score == 0.0
    print("[OK] Allowlist check passed.")

    # 2. Benign clean probe -> real
    res_clean = evaluate_route("192.168.1.100", service="web")
    assert res_clean.destination == "real"
    print("[OK] Benign traffic check passed.")

    # 3. Uncertain case -> fail-safe rate_limit (score in [20, 60))
    evaluate_route("198.51.100.33", service="web")
    res_uncertain = evaluate_route("198.51.100.33", service="ssh", is_login_failure=True)
    assert res_uncertain.destination == "rate_limit"
    assert 20.0 <= res_uncertain.score < 60.0
    print("[OK] Fail-safe rate limit check passed.")

    # 4. Hostile Mirai attempt -> decoy (score >= 60)
    res_hostile = evaluate_route("203.0.113.88", attempted_creds=("admin", "admin"), is_login_failure=True)
    assert res_hostile.destination == "decoy"
    assert res_hostile.score >= 60.0
    print("[OK] Hostile threshold decoy check passed.")

    # 5. Handler enforcement test
    enforced = handle_request("203.0.113.88", service="web")
    assert enforced["selected_handler"] == "decoy_handler"
    assert enforced["handler_result"]["status"] == "TRAPPED_IN_DECOY"
    print("[OK] Handler enforcement check passed.")

    print("\n All Gateway standalone checks passed successfully!\n")
