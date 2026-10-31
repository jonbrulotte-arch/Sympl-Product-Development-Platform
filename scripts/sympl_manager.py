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

# Load .env file into the environment before anything else
_env_file = APP_DIR / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _, _val = _line.partition("=")
        _key = _key.strip()
        _val = _val.strip().strip('"').strip("'")
        if _key and _key not in os.environ:
            os.environ[_key] = _val

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


def _port_pids() -> list[int]:
    """PIDs listening on PORT (only ones this user can see without sudo)."""
    for cmd in (["fuser", f"{PORT}/tcp"], ["lsof", "-t", f"-iTCP:{PORT}", "-sTCP:LISTEN"]):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        # fuser prints "8010/tcp:" on stderr and the PIDs on stdout.
        return sorted({int(t) for t in out.stdout.split() if t.isdigit()})
    return []


def _wait_port_free(seconds: float) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if not _port_pids():
            return True
        time.sleep(0.5)
    return not _port_pids()


def _signal(pid: int, sig: int, group: bool) -> None:
    try:
        os.killpg(pid, sig) if group else os.kill(pid, sig)
    except (ProcessLookupError, PermissionError):
        pass


def start() -> None:
    if _pid():
        print("SymplPM is already running.")
        sys.exit(1)

    # Starting while something else holds the port gives a process that can't
    # bind, and the old build keeps being served. Refuse instead.
    holders = _port_pids()
    if holders:
        print(f"Port {PORT} is still in use by pid(s) {', '.join(map(str, holders))}. "
              f"Run '{sys.argv[0]} stop' (or: sudo fuser -k {PORT}/tcp) and try again.")
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
    # npm start runs next-server as a child; signalling only npm left that
    # child holding the port with the old build. start() uses a new session,
    # so the npm pid is also the process-group id: stop the whole group.
    pid = _pid()
    if pid:
        _signal(pid, signal.SIGTERM, group=True)
        for _ in range(30):
            time.sleep(0.5)
            if _pid() is None:
                break
        else:
            _signal(pid, signal.SIGKILL, group=True)
        PID_FILE.unlink(missing_ok=True)
        print(f"SymplPM stopped (pid {pid}).")
    else:
        print("SymplPM is not running.")

    # Orphans from earlier stops (or a manual start) may still hold the port.
    if not _wait_port_free(5):
        for p in _port_pids():
            print(f"Stopping leftover process {p} on port {PORT}.")
            _signal(p, signal.SIGTERM, group=False)
        if not _wait_port_free(10):
            for p in _port_pids():
                _signal(p, signal.SIGKILL, group=False)
            _wait_port_free(5)
    if _port_pids():
        print(f"WARNING: port {PORT} is still in use by pid(s) {', '.join(map(str, _port_pids()))} "
              f"(owned by another user?). Free it with: sudo fuser -k {PORT}/tcp")


def restart() -> None:
    stop()
    time.sleep(1)
    start()


def status() -> None:
    pid = _pid()
    holders = _port_pids()
    if pid:
        print(f"SymplPM is running (pid {pid}) on port {PORT}.")
        # The listener should be in our process group; anything else is an
        # orphan serving whatever build it started with.
        strays = []
        for p in holders:
            try:
                if os.getpgid(p) != pid:
                    strays.append(p)
            except ProcessLookupError:
                pass
        if strays:
            print(f"WARNING: port {PORT} is held by pid(s) {', '.join(map(str, strays))}, "
                  f"which this manager did not start. Run '{sys.argv[0]} restart'.")
    else:
        print("SymplPM is not running.")
        if holders:
            print(f"WARNING: port {PORT} is held by pid(s) {', '.join(map(str, holders))}.")
        sys.exit(1)


COMMANDS = {"start": start, "stop": stop, "restart": restart, "status": status}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(f"Usage: {sys.argv[0]} {{start|stop|restart|status}}")
        sys.exit(2)
    COMMANDS[sys.argv[1]]()
