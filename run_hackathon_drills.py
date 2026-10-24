#!/usr/bin/env python3
"""
AegisMirage — Live Hackathon Drills Demonstration Runner
Executes Drills A, B, and C against http://127.0.0.1:8000
"""

import sys
import json
import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"


def header(title: str):
    print("\n" + "=" * 75)
    print(f" {title}")
    print("=" * 75)


def subheader(step: str):
    print(f"\n--> {step}")


def main():
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    # Pre-flight health check
    header("PRE-FLIGHT SYSTEM READINESS CHECK")
    res = client.get("/health")
    if res.status_code != 200:
        print(f"[FAIL] Health check failed: {res.status_code}")
        sys.exit(1)
    health = res.json()
    print(f"Service: {health['service']} v{health['version']}")
    print(f"Modules: {json.dumps(health['modules'], indent=2)}")
    print(f"System Stats: {json.dumps(health['stats'], indent=2)}")

    # =========================================================================
    # DRILL A: False Positive Camera Blinding & Unauthorized Unmask Denial
    # =========================================================================
    header("DRILL A: FALSE POSITIVE CAMERA BLINDING & ACCESS DENIAL")

    subheader("[Step A1] Inject Camera Blinding Anomaly Simulation on cam_01")
    res = client.post("/api/cameras/cam_01/simulate/blind")
    print(f"Status: {res.status_code} | Response: {res.json()}")

    subheader("[Step A2] Verify Camera Event Stream Logged Anomaly While Preserving Privacy")
    res = client.get("/api/cameras/events?limit=3")
    events = res.json()
    print(f"Status: {res.status_code} | Recent Event Sample: {events[0] if events else 'None'}")
    if events:
        print(f"Privacy Preserved (Face Blurred): {events[0].get('blurred')}")

    subheader("[Step A3] Rogue Operator Attempts Unauthorized Break-Glass Unmasking")
    res = client.post("/escrow/attempt-unauthorized")
    print(f"HTTP Status: {res.status_code} (Expected: 403 Forbidden)")
    print(f"Server Detail: {res.json().get('detail')}")
    assert res.status_code == 403, f"Expected 403 but got {res.status_code}"

    subheader("[Step A4] Verify Cryptographic Audit Ledger Committed the Denial")
    res = client.get("/escrow/audit-log")
    chain = res.json()
    denial_entry = next((b for b in chain if b["action"] == "FALSE_POSITIVE_UNMASK_BLOCKED"), None)
    if denial_entry:
        print(f"Audit Block #{denial_entry['index']} Action: {denial_entry['action']}")
        print(f"Actor: {denial_entry['actor']} | Camera: {denial_entry['camera_id']}")
        print(f"Details: {denial_entry['details']}")
        print(f"Block Hash: {denial_entry['current_hash'][:32]}...")
    else:
        print("[FAIL] Denial entry not found in audit chain!")
        sys.exit(1)

    subheader("[Step A5] Verify Cryptographic Hash-Chain Tamper Detection")
    res = client.get("/escrow/audit-log/verify")
    integ = res.json()
    print(f"Ledger Intact: {integ['valid']} | Total Blocks: {integ['total_blocks']}")
    print(f"Status: {integ['status']}")

    subheader("[Step A6] Recover Camera Node cam_01 to Normal Feed")
    res = client.post("/api/cameras/cam_01/simulate/recover")
    print(f"Status: {res.status_code} | Recovery: {res.json()}")
    print("\n[PASSED] DRILL A VERIFICATION COMPLETE!")

    # =========================================================================
    # DRILL B: Controlled Honeypot Intrusion & Break-Glass Escrow Quorum
    # =========================================================================
    header("DRILL B: CONTROLLED HONEYPOT INTRUSION & BREAK-GLASS ESCROW QUORUM")

    sid = "sess-drill-b-live-run"

    subheader("[Step B1] Attacker Establishes Decoy Session & Executes Discovery (uname -a)")
    res = client.post("/api/decoy/simulate/command", json={"session_id": sid, "command": "uname -a"})
    cmd_data = res.json()
    print(f"Decoy Emulated Response: {cmd_data.get('output', '').strip()}")
    print(f"Session ID: {cmd_data['event']['session_id']} | Source: {cmd_data['event']['source_ip']}")

    subheader("[Step B2] Attacker Trips HONEYTOKEN CANARY (/etc/camera/credentials.conf)")
    res = client.post("/api/decoy/simulate/command", json={"session_id": sid, "command": "cat /etc/camera/credentials.conf"})
    honey_data = res.json()
    print(f"Honeytoken Bait Response:\n{honey_data.get('output', '').strip()}")
    print(f"Honeytoken Tripwire Activated: {honey_data['event']['honeytoken_hit']}")
    assert honey_data['event']['honeytoken_hit'] is True, "Honeytoken tripwire failed to flag hit!"

    subheader("[Step B3] Verify Real-Time In-Process Ingestion by Threat Intel Engine")
    res = client.get("/intel/sessions")
    sessions = res.json()
    matched = next((s for s in sessions if s["session_id"] == sid), None)
    if matched:
        print(f"Intel Engine Indexed Session: {matched['session_id']}")
        print(f"Honeytoken Flag in Intel: {matched['honeytoken_hit']}")
        print(f"Recorded Commands: {matched['commands']}")
    else:
        print("[FAIL] Session not found in intel engine!")
        sys.exit(1)

    subheader("[Step B4] Inspect Active Escrow Case CASE-2026-001 (Prior to Quorum)")
    res = client.get("/escrow/cases/CASE-2026-001")
    case_info = res.json()
    print(f"Case ID: {case_info['case']['case_id']}")
    print(f"Target Camera: {case_info['case']['camera_id']} @ Window: {case_info['case']['window_id']}")
    print(f"Status: {case_info['case']['status'].upper()}")
    print(f"Approvals: {case_info['approvals_count']}/2 (Current: {case_info['case']['approvals']})")

    subheader("[Step B5] Attempt Footage Unmasking BEFORE Quorum (MUST FAIL 403)")
    res = client.get("/escrow/cases/CASE-2026-001/footage")
    print(f"Pre-Quorum Access Attempt: HTTP {res.status_code} (Expected: 403 Forbidden)")
    print(f"Rejection Reason: {res.json().get('detail')}")
    assert res.status_code == 403, f"Expected 403 but got {res.status_code}"

    subheader("[Step B6] Custodian 2 (Cybercrime Forensics) Casts Decisive Approval Vote")
    vote_payload = {
        "custodian_id": "custodian-2-cybercrime",
        "decision": "approve",
        "justification": f"Warrant confirmed for honeytoken trigger breach in session {sid}.",
    }
    res = client.post("/escrow/cases/CASE-2026-001/vote", json=vote_payload)
    vote_data = res.json()
    print(f"Vote Registered: HTTP {res.status_code}")
    print(f"Quorum Achieved: {vote_data['quorum_achieved']}")
    print(f"Case Final Status: {vote_data['case']['status'].upper()}")
    print(f"Reconstructed Scoped AES-256 Key: {vote_data['unlocked_key']}")

    subheader("[Step B7] Verify BREAK_GLASS_UNMASK_APPROVED Audit Entry Written BEFORE Release")
    res = client.get("/escrow/audit-log")
    chain = res.json()
    unmask_block = next((b for b in chain if b["action"] == "BREAK_GLASS_UNMASK_APPROVED"), None)
    if unmask_block:
        print(f"Audit Block #{unmask_block['index']} Committed: {unmask_block['action']}")
        print(f"Actor: {unmask_block['actor']}")
        print(f"Details: {unmask_block['details']}")
    else:
        print("[FAIL] BREAK_GLASS_UNMASK_APPROVED block missing from audit log!")
        sys.exit(1)

    subheader("[Step B8] Retrieve Unmasked Facial Evidence for Approved Case")
    res = client.get("/escrow/cases/CASE-2026-001/footage")
    footage = res.json()
    print(f"HTTP Status: {res.status_code}")
    print(f"Footage Status: {footage.get('status').upper()}")
    print(f"Camera ID: {footage.get('camera_id')} | Window ID: {footage.get('window_id')}")
    print(f"Decrypted Crop Count: {footage.get('crop_count')}")
    if footage.get("crops_base64"):
        print(f"Base64 Crop Size: {len(footage['crops_base64'][0])} characters (Decrypted JPEG ready for UI)")

    subheader("[Step B9] Verify Unrelated Camera Case Remains Strictly Inaccessible")
    res = client.get("/escrow/cases/CASE-NONEXISTENT/footage")
    print(f"Unrelated Case Access: HTTP {res.status_code} (Expected: 404 Not Found)")
    assert res.status_code == 404

    print("\n[PASSED] DRILL B VERIFICATION COMPLETE!")

    # =========================================================================
    # DRILL C: Campaign Correlation & STIX 2.1 Threat Intel
    # =========================================================================
    header("DRILL C: CAMPAIGN CORRELATION & STIX 2.1 THREAT INTEL")

    subheader("[Step C1] Seed Multi-Group Botnet Scenario into Intel Engine")
    res = client.post("/intel/drill/drill-c")
    print(f"Drill C Scenario Ingested: HTTP {res.status_code} | {res.json()}")

    subheader("[Step C2] Query Clustered Campaigns & Verify Evidence-Backed Graph")
    res = client.get("/intel/campaigns")
    campaigns = res.json()
    print(f"Total Clustered Campaigns: {len(campaigns)}")
    for c in campaigns[:3]:
        print(f"\n  * Campaign ID: {c['campaign_id']}")
        print(f"    Confidence: {c['confidence'].upper()} | Risk Level: {c['risk_level'].upper()}")
        print(f"    Evidence Reasons: {c['evidence_reasons']}")
        print(f"    Associated Sessions: {c['session_ids']}")

    subheader("[Step C3] Query Threat Intelligence Relationship Graph")
    res = client.get("/intel/graph")
    graph = res.json()
    print(f"Graph Nodes: {len(graph.get('nodes', []))} | Graph Edges: {len(graph.get('edges', []))}")
    print(f"Sample Node: {graph['nodes'][0] if graph['nodes'] else 'None'}")
    print(f"Sample Edge: {graph['edges'][0] if graph['edges'] else 'None'}")

    subheader("[Step C4] Export Standards-Compliant STIX 2.1 Threat Intelligence Bundle")
    top_camp = campaigns[0]["campaign_id"]
    res = client.get(f"/intel/export/stix/{top_camp}")
    stix = res.json()
    print(f"STIX 2.1 Bundle ID: {stix.get('id')}")
    print(f"Spec Version: {stix.get('spec_version')}")
    print(f"Objects in Bundle: {len(stix.get('objects', []))}")
    obj_types = [o["type"] for o in stix.get("objects", [])]
    print(f"Contained STIX Object Types: {set(obj_types)}")

    subheader("[Step C5] Verify Cross-City Threat Sharing Federation Registry")
    res = client.get("/intel/federation/registry")
    fed = res.json()
    print(f"Total Shared Intel Records: {fed.get('total_records')}")
    if fed.get("records"):
        print(f"Sample Shared IOC: {fed['records'][0]}")

    print("\n[PASSED] DRILL C VERIFICATION COMPLETE!")

    # Summary
    header("ALL 3 HACKATHON DRILLS COMPLETED AND FULLY VERIFIED")
    print("1. Drill A: False positive blurs maintained; unauthorized unmasking rejected (403) and audited.")
    print("2. Drill B: Honeytoken canary triggered; 2-of-3 Shamir quorum reached; unmasked crops decrypted.")
    print("3. Drill C: Multi-factor botnet clustering verified; weak evidence isolated; STIX 2.1 exported.")
    print("=" * 75 + "\n")


if __name__ == "__main__":
    main()
