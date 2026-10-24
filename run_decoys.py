"""
AegisMirage Decoy Service Runner (Stage 2: SSH + MQTT Decoys).

Runs the standalone decoy services (asyncssh on port 2222 and MQTT on port 1883)
bound to loopback in an unprivileged runtime.
"""

import asyncio
import signal
import sys

import decoy
import ssh_decoy


async def main() -> None:
    host = "127.0.0.1"
    ssh_port = 2222
    enable_mqtt = "--enable-mqtt" in sys.argv
    mqtt_port = 1883

    # Parse port overrides if specified as numbers
    for arg in sys.argv[1:]:
        if arg.isdigit():
            ssh_port = int(arg)
            break

    print("\n" + "=" * 60)
    print("AegisMirage — Phantom Twin Honeypot Protocol Services")
    print("=" * 60)
    print(f"[*] Starting Core SSH Decoy on {host}:{ssh_port}...")
    await decoy.start_ssh_decoy(host=host, port=ssh_port)

    if enable_mqtt:
        print(f"[*] Starting Optional MQTT Decoy on {host}:{mqtt_port}...")
        await decoy.start_mqtt_decoy(host=host, port=mqtt_port)
    else:
        print("[*] MQTT Decoy is disabled by default (pass --enable-mqtt to activate).")

    print("[*] Honeypot protocol service active. Press Ctrl+C to terminate.")

    # Keep running until cancelled
    stop_event = asyncio.Event()

    def signal_handler() -> None:
        print("\n[*] Shutdown signal received...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Signals not fully supported in ProactorEventLoop on Windows
            pass

    try:
        await stop_event.wait()
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        print("[*] Stopping honeypot services...")
        await decoy.stop_ssh_decoy()
        if enable_mqtt:
            await decoy.stop_mqtt_decoy()
        print("[*] Shutdown complete.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Exited.")
