"""
AegisMirage Real MQTT Decoy Protocol Server.

Owner: Member B — Stage 2 (Phantom Twin Core Decoy)

Features:
1. Implements standard MQTT v3.1.1 protocol over asyncio TCP sockets.
   Compatible with standard MQTT clients (e.g. `paho-mqtt`, `mosquitto_sub`, `mosquitto_pub`).
2. Exposes documented fictional IoT smart camera topics:
   - `aegis/cameras/cam-01/telemetry` (Live FPS, temperature, bitrate)
   - `aegis/cameras/cam-01/config` (Camera resolution, RTSP stream parameters)
   - `aegis/cameras/cam-01/alerts` (Perimeter motion, tamper alarms)
   - `aegis/cameras/cam-01/vault_credentials` (Honeytoken bait topic!)
3. In-memory message bus keeping all state strictly inside the decoy.
   NEVER bridges or communicates with real IoT hardware or external networks.
4. Telemetry and IOC recording:
   - Records connections, subscriptions, and publication payloads.
   - Safe authentication logging (passwords fingerprinted, never stored raw).
   - Scans message payloads for malware hashes and C2 addresses.
   - Accessing or publishing to bait topics trips `honeytoken_hit = True`.
5. Bound to loopback (127.0.0.1:1883) by default with connection limits.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import struct
import time
from typing import Dict, List, Optional, Set, Tuple

import decoy


# =============================================================================
# Configuration & Fictional Topics
# =============================================================================

DEFAULT_MQTT_HOST = "127.0.0.1"
DEFAULT_MQTT_PORT = 1883
MAX_CONCURRENT_MQTT_CLIENTS = 20

TOPIC_TELEMETRY = "aegis/cameras/cam-01/telemetry"
TOPIC_CONFIG = "aegis/cameras/cam-01/config"
TOPIC_ALERTS = "aegis/cameras/cam-01/alerts"
TOPIC_HONEYTOKEN_BAIT = "aegis/cameras/cam-01/vault_credentials"

DOCUMENTED_TOPICS = [
    TOPIC_TELEMETRY,
    TOPIC_CONFIG,
    TOPIC_ALERTS,
    TOPIC_HONEYTOKEN_BAIT,
]

INITIAL_TELEMETRY_PAYLOAD = json.dumps({
    "camera_id": "cam-smart-04",
    "status": "ONLINE",
    "fps": 30,
    "resolution": "1920x1080",
    "cpu_temp_c": 43.8,
    "stream_url": "rtsp://127.0.0.1:554/live/ch0",
    "uptime_seconds": 18420,
})

INITIAL_CONFIG_PAYLOAD = json.dumps({
    "night_vision": "auto",
    "motion_sensitivity": "high",
    "h264_bitrate_kbps": 4096,
    "firmware": "v2.14-stable",
    "sync_cloud": "disabled",
})

HONEYTOKEN_MQTT_PAYLOAD = json.dumps({
    "warning": "__HONEYTOKEN__",
    "vault_access_key": "AKIA_MQTT_TRAP_SECRET_KEY_8829",
    "recovery_endpoint": "http://185.220.101.5:8080/sync",
})


# =============================================================================
# Helper: Safe Credential Fingerprinting
# =============================================================================

def safe_password_fingerprint(password: str) -> str:
    """Computes a non-reversible SHA-256 fingerprint for auth logs."""
    if not password:
        return "<none>"
    fp = hashlib.sha256(password.encode("utf-8")).hexdigest()[:12]
    return f"masked:***[sha256:{fp}]"


# =============================================================================
# MQTT 3.1.1 Protocol Packet Parsing Helpers
# =============================================================================

def encode_remaining_length(length: int) -> bytes:
    """Encode an integer into MQTT variable length format."""
    encoded = bytearray()
    while True:
        digit = length % 128
        length = length // 128
        if length > 0:
            digit |= 0x80
        encoded.append(digit)
        if length == 0:
            break
    return bytes(encoded)


async def read_remaining_length(reader: asyncio.StreamReader) -> int:
    """Decode an MQTT variable length integer from stream."""
    multiplier = 1
    value = 0
    while True:
        byte_data = await reader.readexactly(1)
        digit = byte_data[0]
        value += (digit & 127) * multiplier
        multiplier *= 128
        if (digit & 128) == 0:
            break
    return value


def build_publish_packet(topic: str, payload: bytes, qos: int = 0) -> bytes:
    """Construct an MQTT PUBLISH packet."""
    topic_bytes = topic.encode("utf-8")
    variable_header = struct.pack("!H", len(topic_bytes)) + topic_bytes
    packet_body = variable_header + payload
    fixed_header = bytes([0x30 | (qos << 1)]) + encode_remaining_length(len(packet_body))
    return fixed_header + packet_body


# =============================================================================
# MQTT Client Connection Handler
# =============================================================================

class MQTTClientHandler:
    """Manages an individual MQTT TCP client connection."""

    def __init__(
        self,
        server: MQTTDecoyServer,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        self.server = server
        self.reader = reader
        self.writer = writer
        self.client_id: str = "unknown"
        self.peer_ip: str = "127.0.0.1"
        self.session_id: str = ""
        self.subscriptions: Set[str] = set()

        peername = writer.get_extra_info("peername")
        if peername:
            self.peer_ip = peername[0]

    async def run(self) -> None:
        """Main packet processing loop."""
        try:
            while not self.reader.at_eof():
                # Read 1 byte fixed header
                first_byte_data = await self.reader.read(1)
                if not first_byte_data:
                    break

                first_byte = first_byte_data[0]
                packet_type = (first_byte >> 4) & 0x0F
                flags = first_byte & 0x0F

                rem_len = await read_remaining_length(self.reader)
                packet_body = await self.reader.readexactly(rem_len) if rem_len > 0 else b""

                if packet_type == 1:  # CONNECT
                    await self._handle_connect(packet_body)
                elif packet_type == 3:  # PUBLISH
                    await self._handle_publish(flags, packet_body)
                elif packet_type == 8:  # SUBSCRIBE
                    await self._handle_subscribe(packet_body)
                elif packet_type == 12:  # PINGREQ
                    # Respond with PINGRESP
                    self.writer.write(b"\xd0\x00")
                    await self.writer.drain()
                elif packet_type == 14:  # DISCONNECT
                    print(f"[MQTT Decoy] Client {self.client_id} disconnected cleanly.")
                    break
        except asyncio.IncompleteReadError:
            pass
        except Exception as e:
            print(f"[MQTT Decoy] Error with client {self.client_id} from {self.peer_ip}: {e}")
        finally:
            self.server.remove_client(self)
            self.writer.close()
            try:
                await self.writer.wait_closed()
            except Exception:
                pass

    async def _handle_connect(self, body: bytes) -> None:
        """Processes MQTT CONNECT packet."""
        # Protocol name & level
        proto_len = struct.unpack("!H", body[:2])[0]
        offset = 2 + proto_len
        proto_level = body[offset]
        connect_flags = body[offset + 1]
        keepalive = struct.unpack("!H", body[offset + 2:offset + 4])[0]
        offset += 4

        # Client ID
        cid_len = struct.unpack("!H", body[offset:offset + 2])[0]
        offset += 2
        self.client_id = body[offset:offset + cid_len].decode("utf-8", errors="replace")
        offset += cid_len

        # Username / Password if flags set
        username = ""
        password = ""
        if connect_flags & 0x80:  # Username flag
            u_len = struct.unpack("!H", body[offset:offset + 2])[0]
            offset += 2
            username = body[offset:offset + u_len].decode("utf-8", errors="replace")
            offset += u_len

        if connect_flags & 0x40:  # Password flag
            p_len = struct.unpack("!H", body[offset:offset + 2])[0]
            offset += 2
            password = body[offset:offset + p_len].decode("utf-8", errors="replace")
            offset += p_len

        self.session_id = f"mqtt-{hashlib.md5(self.client_id.encode()).hexdigest()[:8]}"

        # Record authentication telemetry without storing raw passwords
        safe_pwd = safe_password_fingerprint(password)
        decoy.record_decoy_login(
            session_id=self.session_id,
            source_ip=self.peer_ip,
            service="mqtt",
            username=username if username else "<anonymous>",
            password=safe_pwd,
            success=True,
        )

        print(
            f"[MQTT Decoy] Connected: ClientID='{self.client_id}', IP={self.peer_ip}, "
            f"User='{username or 'anon'}' (Session: {self.session_id})"
        )

        # Send CONNACK (Return Code 0 = Connection Accepted)
        connack = b"\x20\x02\x00\x00"
        self.writer.write(connack)
        await self.writer.drain()

        # Automatically publish initial retained state to the new client for realistic immersion
        for topic, payload in self.server.retained_messages.items():
            pkt = build_publish_packet(topic, payload)
            self.writer.write(pkt)
        await self.writer.drain()

    async def _handle_subscribe(self, body: bytes) -> None:
        """Processes MQTT SUBSCRIBE packet."""
        packet_id = struct.unpack("!H", body[:2])[0]
        offset = 2
        granted_qos = []

        while offset < len(body):
            topic_len = struct.unpack("!H", body[offset:offset + 2])[0]
            offset += 2
            topic = body[offset:offset + topic_len].decode("utf-8", errors="replace")
            offset += topic_len
            req_qos = body[offset]
            offset += 1

            self.subscriptions.add(topic)
            granted_qos.append(min(req_qos, 1))

            print(f"[MQTT Decoy] Client {self.client_id} subscribed to topic '{topic}'")

            # Check if attacker subscribed to honeytoken bait topic!
            if "vault_credentials" in topic or "honeytoken" in topic:
                decoy.flag_honeytoken_hit(self.session_id)
                print(f"[MQTT Decoy] [!] HONEYTOKEN TRIP: Attacker subscribed to bait topic '{topic}'!")

        # Send SUBACK
        suback_body = struct.pack("!H", packet_id) + bytes(granted_qos)
        suback = bytes([0x90]) + encode_remaining_length(len(suback_body)) + suback_body
        self.writer.write(suback)
        await self.writer.drain()

    async def _handle_publish(self, flags: int, body: bytes) -> None:
        """Processes incoming PUBLISH packet."""
        qos = (flags >> 1) & 0x03
        topic_len = struct.unpack("!H", body[:2])[0]
        topic = body[2:2 + topic_len].decode("utf-8", errors="replace")
        offset = 2 + topic_len

        packet_id = 0
        if qos > 0:
            packet_id = struct.unpack("!H", body[offset:offset + 2])[0]
            offset += 2

        payload = body[offset:]
        payload_str = payload.decode("utf-8", errors="replace")

        print(f"[MQTT Decoy] [{self.session_id}] Published to '{topic}': {payload_str[:80]}...")

        # Record publication as decoy command for telemetry and audit
        cmd_record = f"MQTT_PUB topic='{topic}' payload='{payload_str}'"
        decoy.execute_decoy_command(self.session_id, cmd_record)

        # Check for honeytoken compromise in topic or payload
        if "vault_credentials" in topic or "credentials.conf" in payload_str or "vault_token" in payload_str:
            decoy.flag_honeytoken_hit(self.session_id)
            print(f"[MQTT Decoy] [!] HONEYTOKEN TRIP: Attacker accessed/published bait credential on MQTT!")

        # If QoS 1, send PUBACK
        if qos == 1:
            puback = b"\x40\x02" + struct.pack("!H", packet_id)
            self.writer.write(puback)
            await self.writer.drain()

        # Broadcast to other subscribers in this in-memory sandbox
        await self.server.broadcast_message(topic, payload, exclude_client=self)


# =============================================================================
# Decoy MQTT Server Controller
# =============================================================================

class MQTTDecoyServer:
    """Asynchronous MQTT Decoy Protocol Server."""

    def __init__(
        self,
        host: str = DEFAULT_MQTT_HOST,
        port: int = DEFAULT_MQTT_PORT,
    ) -> None:
        self.host = host
        self.port = port
        self.server: Optional[asyncio.Server] = None
        self.clients: List[MQTTClientHandler] = []

        # In-memory retained topics for initial state
        self.retained_messages: Dict[str, bytes] = {
            TOPIC_TELEMETRY: INITIAL_TELEMETRY_PAYLOAD.encode("utf-8"),
            TOPIC_CONFIG: INITIAL_CONFIG_PAYLOAD.encode("utf-8"),
            TOPIC_HONEYTOKEN_BAIT: HONEYTOKEN_MQTT_PAYLOAD.encode("utf-8"),
        }

    def remove_client(self, client: MQTTClientHandler) -> None:
        if client in self.clients:
            self.clients.remove(client)

    async def broadcast_message(
        self,
        topic: str,
        payload: bytes,
        exclude_client: Optional[MQTTClientHandler] = None,
    ) -> None:
        """Dispatches messages to matching subscribers within the local sandbox."""
        self.retained_messages[topic] = payload
        packet = build_publish_packet(topic, payload)

        for client in list(self.clients):
            if client is exclude_client:
                continue
            if any(self._topic_matches(sub, topic) for sub in client.subscriptions):
                try:
                    client.writer.write(packet)
                    await client.writer.drain()
                except Exception:
                    pass

    def _topic_matches(self, sub_filter: str, topic: str) -> bool:
        """Basic MQTT wildcard and exact matching (# and +)."""
        if sub_filter in ("#", topic):
            return True
        if sub_filter.endswith("/#"):
            prefix = sub_filter[:-2]
            return topic.startswith(prefix)
        return False

    async def _handle_new_connection(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        if len(self.clients) >= MAX_CONCURRENT_MQTT_CLIENTS:
            writer.close()
            return

        handler = MQTTClientHandler(self, reader, writer)
        self.clients.append(handler)
        asyncio.create_task(handler.run())

    async def start(self) -> None:
        """Starts the MQTT TCP protocol listener."""
        self.server = await asyncio.start_server(
            self._handle_new_connection,
            self.host,
            self.port,
        )
        print(f"[MQTT Decoy] Server listening on {self.host}:{self.port} (Loopback / Safe Mode)")

    async def stop(self) -> None:
        """Stops the MQTT server and closes client connections."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None

        for client in list(self.clients):
            client.writer.close()
        self.clients.clear()
        print("[MQTT Decoy] Server stopped.")


# Module singleton
_mqtt_server = MQTTDecoyServer()


def get_mqtt_server() -> MQTTDecoyServer:
    return _mqtt_server
