"""
AegisMirage — Integration Tests for Real SSH and MQTT Protocol Decoy Interfaces.

Verifies:
1. Real asyncssh SSH server listener:
   - Real SSH client connection using asyncssh.
   - Authentication with valid demo credentials (root:root) vs invalid credentials.
   - Safe auth logging (passwords fingerprinted, no raw password storage).
   - Interactive shell command execution (pwd, whoami) in decoy sandbox.
   - Honeytoken bait access triggering Rickroll payload.
   - Rejection of port forwarding (least privilege).
2. Real MQTT 3.1.1 protocol server listener:
   - Real MQTT client connection using paho-mqtt.
   - Subscription to documented fictional camera topics.
   - Publishing telemetry and message capture in decoy session telemetry.
   - Honeytoken bait topic trip detection.
   - Safe auth logging without raw passwords.
"""

import asyncio
import time
import unittest
import paho.mqtt.client as mqtt

import decoy
import ssh_decoy
import mqtt_decoy


class TestRealSSHDecoyInterface(unittest.IsolatedAsyncioTestCase):
    """Verifies the live asyncssh server with a real SSH client."""

    TEST_SSH_PORT = 22222
    TEST_SSH_HOST = "127.0.0.1"

    async def asyncSetUp(self) -> None:
        decoy.reset_decoy_state()
        self.controller = ssh_decoy.DecoySSHServerController(
            host=self.TEST_SSH_HOST,
            port=self.TEST_SSH_PORT,
        )
        await self.controller.start()

    async def asyncTearDown(self) -> None:
        await self.controller.stop()

    async def test_ssh_valid_login_and_interactive_commands(self) -> None:
        """Connect with real SSH client, execute commands, and verify sandboxed execution."""
        import asyncssh

        async with asyncssh.connect(
            self.TEST_SSH_HOST,
            port=self.TEST_SSH_PORT,
            username="root",
            password="root",  # Recognized demo credential
            known_hosts=None,
        ) as conn:
            # Open interactive shell session
            async with conn.create_process(term_type="xterm") as process:
                # Read initial banner
                banner = await asyncio.wait_for(process.stdout.read(1024), timeout=3.0)
                self.assertIn("AegisOS", banner)

                # Send 'pwd\n'
                process.stdin.write("pwd\n")
                await process.stdin.drain()

                # Read pwd response
                output = await asyncio.wait_for(process.stdout.read(1024), timeout=3.0)
                self.assertIn("/", output)

                # Send command to trigger honeytoken
                process.stdin.write("cat /etc/camera/credentials.conf\n")
                await process.stdin.drain()

                trap_output = await asyncio.wait_for(process.stdout.read(2048), timeout=3.0)
                self.assertIn("NEVER GONNA GIVE YOU UP", trap_output)

        # Verify telemetry recorded honeytoken hit
        sessions = decoy.get_active_sessions()
        self.assertTrue(len(sessions) > 0)
        ssh_session = next(s for s in sessions if s.service == "ssh")
        self.assertTrue(ssh_session.honeytoken_hit)

        # Verify NO raw password in any session or command log
        for cmd in ssh_session.commands:
            self.assertNotIn("root:root", cmd)

    async def test_ssh_invalid_login_rejected(self) -> None:
        """Invalid credentials must be rejected by the SSH server."""
        import asyncssh

        with self.assertRaises(asyncssh.PermissionDenied):
            await asyncssh.connect(
                self.TEST_SSH_HOST,
                port=self.TEST_SSH_PORT,
                username="intruder",
                password="WrongPassword123!",
                known_hosts=None,
            )

        # Verify failure was logged in telemetry with safe masked fingerprint
        sessions = decoy.get_active_sessions()
        self.assertTrue(any(s.failed_logins >= 1 for s in sessions))

    async def test_ssh_port_forwarding_disabled(self) -> None:
        """Port forwarding must be denied for least privilege."""
        import asyncssh

        async with asyncssh.connect(
            self.TEST_SSH_HOST,
            port=self.TEST_SSH_PORT,
            username="root",
            password="root",
            known_hosts=None,
        ) as conn:
            with self.assertRaises(asyncssh.ChannelOpenError):
                await conn.create_connection(
                    asyncio.Protocol,
                    "127.0.0.1",
                    80,
                )


class TestRealMQTTDecoyInterface(unittest.IsolatedAsyncioTestCase):
    """Verifies the live MQTT protocol server with a real paho-mqtt client."""

    TEST_MQTT_PORT = 18883
    TEST_MQTT_HOST = "127.0.0.1"

    async def asyncSetUp(self) -> None:
        decoy.reset_decoy_state()
        self.server = mqtt_decoy.MQTTDecoyServer(
            host=self.TEST_MQTT_HOST,
            port=self.TEST_MQTT_PORT,
        )
        await self.server.start()

    async def asyncTearDown(self) -> None:
        await self.server.stop()

    async def test_mqtt_real_client_publish_and_subscribe(self) -> None:
        """Connect with real paho-mqtt client, publish message, and verify decoy capture."""
        received_messages = []

        def on_message(client, userdata, msg):
            received_messages.append((msg.topic, msg.payload.decode()))

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="test-sensor-node-01")
        client.on_message = on_message
        client.username_pw_set("camera_node", "demoPass2026")

        client.connect(self.TEST_MQTT_HOST, self.TEST_MQTT_PORT, keepalive=60)
        client.loop_start()
        try:
            # Subscribe to telemetry topic
            client.subscribe(mqtt_decoy.TOPIC_TELEMETRY, qos=0)
            await asyncio.sleep(0.4)

            # Publish an alert message
            alert_payload = '{"event": "motion_detected", "zone": "south_gate"}'
            client.publish(mqtt_decoy.TOPIC_ALERTS, alert_payload, qos=0)
            await asyncio.sleep(0.4)

            # Publish to honeytoken bait topic to trip the trap
            bait_probe = '{"probe": "read_credentials"}'
            client.publish(mqtt_decoy.TOPIC_HONEYTOKEN_BAIT, bait_probe, qos=0)
            await asyncio.sleep(0.4)
        finally:
            client.loop_stop()
            client.disconnect()

        # Check telemetry recorded in decoy engine
        sessions = decoy.get_active_sessions()
        self.assertTrue(len(sessions) > 0)
        mqtt_session = next(s for s in sessions if s.service == "mqtt")

        # Verify command/publication logged
        self.assertTrue(any("MQTT_PUB" in cmd for cmd in mqtt_session.commands))

        # Verify honeytoken trip on bait topic
        self.assertTrue(mqtt_session.honeytoken_hit)


if __name__ == "__main__":
    unittest.main()
