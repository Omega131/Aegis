"""
AegisMirage Decoy Service Runner (Stage 2: SSH + MQTT Decoys).

Runs the standalone decoy services (asyncssh on port 2222 and MQTT on port 1883)
bound to loopback in an unprivileged runtime.
"""

import asyncio
import signal
import sys

import decoy
import mqtt_decoy
import ssh_decoy


async def main() -> None:
    host = "0.0.0.0"
    ssh_port = int(sys.argv[1]) if len(sys.argv) > 1 else 2222
    mqtt_port = int(sys.argv[2]) if len(sys.argv) > 2 else 1883

    print("\n" + "=" * 60)
    print("AegisMirage — Phantom Twin Decoy Protocol Services")
    print("=" * 60)
    print(f"[*] Starting SSH Decoy on {host}:{ssh_port}...")
    await decoy.start_ssh_decoy(host=host, port=ssh_port)

    print(f"[*] Starting MQTT Decoy on {host}:{mqtt_port}...")
    await decoy.start_mqtt_decoy(host=host, port=mqtt_port)

    print("[*] Both Decoy services active. Press Ctrl+C to terminate.")

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
        print("[*] Stopping decoy services...")
        await decoy.stop_ssh_decoy()
        await decoy.stop_mqtt_decoy()
        print("[*] Shutdown complete.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Exited.")
