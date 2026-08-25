#!/usr/bin/env python3
"""
SymplPM process manager — runs inside the production Python venv.
Usage: python sympl_manager.py {start|stop|restart|status}
"""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
_BASE = Path(os.environ.get("SYMPLPM_BASE", str(APP_DIR)))
PID_FILE = Path(os.environ.get("SYMPLPM_PID", str(_BASE / "SymplPM.pid")))
LOG_FILE = Path(os.environ.get("SYMPLPM_LOG", str(_BASE / "logs" / "app.log")))
PORT = os.environ.get("PORT", "8010")
NODE_ENV = os.environ.get("NODE_ENV", "production")


def _pid() -> int | None:
    try:
        pid = int(PID_FILE.read_text().strip())
        os.kill(pid, 0)  # check the process exists
        return pid
    except (FileNotFoundError, ValueError, ProcessLookupError, PermissionError):
        PID_FILE.unlink(missing_ok=True)
        return None


def start() -> None:
    if _pid():
        print("SymplPM is already running.")
        sys.exit(1)

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    log = LOG_FILE.open("a")

    env = {**os.environ, "PORT": PORT, "NODE_ENV": NODE_ENV}
    proc = subprocess.Popen(
        ["npm", "start"],
        cwd=APP_DIR,
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    PID_FILE.write_text(str(proc.pid))
    print(f"SymplPM started (pid {proc.pid}) on port {PORT} — log: {LOG_FILE}")


def stop() -> None:
    pid = _pid()
    if not pid:
        print("SymplPM is not running.")
        return
    os.kill(pid, signal.SIGTERM)
    for _ in range(30):
        time.sleep(0.5)
        if _pid() is None:
            break
    else:
        os.kill(pid, signal.SIGKILL)
    PID_FILE.unlink(missing_ok=True)
    print(f"SymplPM stopped (pid {pid}).")


def restart() -> None:
    stop()
    time.sleep(1)
    start()


def status() -> None:
    pid = _pid()
    if pid:
        print(f"SymplPM is running (pid {pid}) on port {PORT}.")
    else:
        print("SymplPM is not running.")
        sys.exit(1)


COMMANDS = {"start": start, "stop": stop, "restart": restart, "status": status}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(f"Usage: {sys.argv[0]} {{start|stop|restart|status}}")
        sys.exit(2)
    COMMANDS[sys.argv[1]]()
