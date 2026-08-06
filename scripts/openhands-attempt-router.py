#!/usr/bin/env python3

import hmac
import http.client
import json
import os
import re
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


RUNTIME_IMAGE = os.environ.get(
    "OPENHANDS_RUNTIME_IMAGE",
    "ghcr.io/ln-one/spectra-agent-runtime@sha256:62a919a1b8380c524dbb9fc7e082e202a4943d4303e45414c9510aed00fdc7dc",
)
SESSION_API_KEY = os.environ["OPENHANDS_RUNTIME_API_KEY"]
LISTEN_HOST = os.environ.get("OPENHANDS_ROUTER_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("OPENHANDS_ROUTER_PORT", "8100"))
WORKSPACE_ROOT = os.environ.get("OPENHANDS_WORKSPACE_ROOT", "/workspace/spectra")
DOCKER_PROXY_URL = os.environ.get("OPENHANDS_DOCKER_PROXY_URL", "")
ATTEMPT_PATH = re.compile(
    r"^/agent-runtime/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/?(.*)$",
    re.IGNORECASE,
)
RUNTIME_START_LOCK = threading.Lock()


def container_name(attempt_id):
    return f"spectra-openhands-{attempt_id}"


def volume_name(attempt_id):
    return f"spectra-openhands-data-{attempt_id}"


def docker(*args):
    return subprocess.run(
        ["docker", *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def inspect_runtime(attempt_id):
    try:
        result = docker("inspect", container_name(attempt_id))
    except subprocess.CalledProcessError:
        return None
    container = json.loads(result.stdout)[0]
    ports = container.get("NetworkSettings", {}).get("Ports", {}).get("8000/tcp") or []
    port = int(ports[0]["HostPort"]) if ports else None
    return {"running": container.get("State", {}).get("Running", False), "port": port}


def runtime_ready(port):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", "/ready", headers={"X-Session-API-Key": SESSION_API_KEY})
        return connection.getresponse().status == 200
    except OSError:
        return False
    finally:
        connection.close()


def wait_for_runtime(attempt_id):
    for _ in range(40):
        runtime = inspect_runtime(attempt_id)
        if runtime and runtime["running"] and runtime["port"] and runtime_ready(runtime["port"]):
            return runtime["port"]
        time.sleep(0.5)
    raise RuntimeError("runtime did not become ready")


def start_runtime(attempt_id):
    with RUNTIME_START_LOCK:
        runtime = inspect_runtime(attempt_id)
        if runtime and runtime["running"]:
            return wait_for_runtime(attempt_id)
        if runtime:
            docker("start", container_name(attempt_id))
        else:
            docker("volume", "create", volume_name(attempt_id))
            environment = [
                "-e",
                f"SESSION_API_KEY={SESSION_API_KEY}",
                "-e",
                f"OH_SECRET_KEY={secrets.token_urlsafe(32)}",
                "-e",
                "OH_ENABLE_VNC=false",
                "-e",
                "OH_ENABLE_VSCODE=false",
            ]
            if os.environ.get("UNSPLASH_ACCESS_KEY"):
                environment.extend(["-e", f"UNSPLASH_ACCESS_KEY={os.environ['UNSPLASH_ACCESS_KEY']}"])
            if DOCKER_PROXY_URL:
                environment.extend(
                    [
                        "-e",
                        f"HTTP_PROXY={DOCKER_PROXY_URL}",
                        "-e",
                        f"HTTPS_PROXY={DOCKER_PROXY_URL}",
                        "-e",
                        "NO_PROXY=localhost,127.0.0.1",
                    ]
                )
            docker(
                "run",
                "-d",
                "--name",
                container_name(attempt_id),
                "--label",
                "spectra.openhands.managed=true",
                "--label",
                f"spectra.openhands.attempt-id={attempt_id}",
                "--cpus",
                "2",
                "--memory",
                "4g",
                "--pids-limit",
                "512",
                "--security-opt",
                "no-new-privileges:true",
                "--add-host",
                "host.docker.internal:host-gateway",
                "-p",
                "127.0.0.1::8000",
                "-v",
                f"{volume_name(attempt_id)}:{WORKSPACE_ROOT}",
                *environment,
                RUNTIME_IMAGE,
                "--host",
                "0.0.0.0",
                "--port",
                "8000",
            )
        return wait_for_runtime(attempt_id)


class Router(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_GET(self):
        self.proxy()

    def do_POST(self):
        self.proxy()

    def do_PUT(self):
        self.proxy()

    def do_PATCH(self):
        self.proxy()

    def do_DELETE(self):
        self.proxy()

    def proxy(self):
        presented_key = self.headers.get("X-Session-API-Key", "")
        if not hmac.compare_digest(presented_key, SESSION_API_KEY):
            self.send_error(401)
            return
        match = ATTEMPT_PATH.match(self.path.split("?", 1)[0])
        if not match:
            self.send_error(404)
            return
        attempt_id = match.group(1).lower()
        suffix = match.group(2)
        path = f"/{suffix}"
        if "?" in self.path:
            path += f"?{self.path.split('?', 1)[1]}"
        try:
            port = start_runtime(attempt_id)
            self.forward(port, path)
        except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
            print("OpenHands runtime unavailable", {"attempt_id": attempt_id, "error": str(error)})
            self.send_error(502, "OpenHands runtime unavailable")

    def forward(self, port, path):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3600)
        connection.putrequest(self.command, path, skip_host=True)
        for name, value in self.headers.items():
            if name.lower() not in {"connection", "host", "transfer-encoding"}:
                connection.putheader(name, value)
        connection.putheader("Host", f"127.0.0.1:{port}")
        connection.endheaders()
        remaining = int(self.headers.get("Content-Length", "0"))
        while remaining:
            chunk = self.rfile.read(min(65536, remaining))
            if not chunk:
                break
            connection.send(chunk)
            remaining -= len(chunk)
        upstream = connection.getresponse()
        self.send_response(upstream.status)
        for name, value in upstream.getheaders():
            if name.lower() not in {"connection", "transfer-encoding"}:
                self.send_header(name, value)
        self.end_headers()
        while chunk := upstream.read(65536):
            self.wfile.write(chunk)
        self.close_connection = True
        connection.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Router)
    print(f"OpenHands attempt router listening on {LISTEN_HOST}:{LISTEN_PORT}")
    server.serve_forever()
