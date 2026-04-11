#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


ROOT = Path(__file__).resolve().parent.parent
BASE_FILES = ["docker-compose.yml"]
LOCK_DIR = ROOT / "infra"
ENV_LOCK_FILE = ROOT / ".env.compose.lock"
ENV_MIRROR_FILE = ROOT / ".env"
VALID_CHANNELS = {"develop", "main"}


class ServiceSource(NamedTuple):
    name: str
    display_name: str
    path: str
    override_file: str | None
    env_var: str


@dataclass(frozen=True)
class ServiceLock:
    image: str
    tag: str
    digest: str | None
    source_branch: str
    published: bool
    notes: str = ""

    @property
    def pinned_ref(self) -> str | None:
        if not self.digest:
            return None
        return f"{self.image}@{self.digest}"

    @property
    def tag_ref(self) -> str:
        return f"{self.image}:{self.tag}"


SERVICE_SOURCES: tuple[ServiceSource, ...] = (
    ServiceSource(
        name="pagevra",
        display_name="Pagevra",
        path="pagevra",
        override_file="docker-compose.pagevra.dev.yml",
        env_var="PAGEVRA_IMAGE",
    ),
    ServiceSource(
        name="dualweave",
        display_name="Dualweave",
        path="dualweave",
        override_file="docker-compose.dualweave.dev.yml",
        env_var="DUALWEAVE_IMAGE",
    ),
    ServiceSource(
        name="ourograph",
        display_name="Ourograph",
        path="ourograph",
        override_file="docker-compose.ourograph.dev.yml",
        env_var="OUROGRAPH_IMAGE",
    ),
    ServiceSource(
        name="stratumind",
        display_name="Stratumind",
        path="stratumind",
        override_file="docker-compose.stratumind.dev.yml",
        env_var="STRATUMIND_IMAGE",
    ),
)


def submodule_initialized(name: str, path: str | None = None) -> bool:
    source_path = path or name
    result = subprocess.run(
        ["git", "-C", str(ROOT), "submodule", "status", "--", name],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return False

    line = result.stdout.strip()
    if not line:
        return False

    if line[0] == "-":
        return False

    return (ROOT / source_path / ".git").exists()


def local_source_present(source: ServiceSource) -> bool:
    root = ROOT / source.path
    if not root.exists():
        return False
    if submodule_initialized(source.name, source.path):
        return True
    if source.name in {"ourograph", "stratumind"}:
        return (root / "Dockerfile").exists() and (root / "README.md").exists()
    return False


def resolve_service_modes() -> list[tuple[ServiceSource, str]]:
    modes: list[tuple[ServiceSource, str]] = []
    for source in SERVICE_SOURCES:
        mode = "local-source" if local_source_present(source) else "image"
        modes.append((source, mode))
    return modes


def infer_channel() -> str:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "branch", "--show-current"],
        capture_output=True,
        text=True,
        check=False,
    )
    branch = result.stdout.strip()
    if branch == "main":
        return "main"
    return "develop"


def normalize_channel(channel: str | None) -> str:
    resolved = channel or infer_channel()
    if resolved not in VALID_CHANNELS:
        raise ValueError(
            f"Unsupported channel '{resolved}'. Expected one of: "
            + ", ".join(sorted(VALID_CHANNELS))
        )
    return resolved


def lock_path(channel: str) -> Path:
    return LOCK_DIR / f"stack-lock.{channel}.json"


def load_stack_lock(channel: str) -> dict[str, ServiceLock]:
    path = lock_path(channel)
    if not path.exists():
        raise ValueError(f"Missing stack lock file: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("channel") != channel:
        raise ValueError(
            f"Stack lock {path} declares channel '{payload.get('channel')}', expected '{channel}'"
        )

    services_payload = payload.get("services")
    if not isinstance(services_payload, dict):
        raise ValueError(f"Stack lock {path} is missing a valid 'services' object")

    locks: dict[str, ServiceLock] = {}
    for source in SERVICE_SOURCES:
        service_payload = services_payload.get(source.name)
        if not isinstance(service_payload, dict):
            raise ValueError(f"Stack lock {path} is missing service '{source.name}'")
        image = str(service_payload.get("image") or "").strip()
        tag = str(service_payload.get("tag") or "").strip()
        digest = service_payload.get("digest")
        published = bool(service_payload.get("published", bool(digest)))
        source_branch = str(service_payload.get("source_branch") or "").strip()
        notes = str(service_payload.get("notes") or "").strip()
        if not image:
            raise ValueError(f"Service '{source.name}' in {path} is missing 'image'")
        if not tag:
            raise ValueError(f"Service '{source.name}' in {path} is missing 'tag'")
        if not source_branch:
            raise ValueError(
                f"Service '{source.name}' in {path} is missing 'source_branch'"
            )
        if digest is not None:
            digest = str(digest).strip()
            if digest and not digest.startswith("sha256:"):
                raise ValueError(
                    f"Service '{source.name}' in {path} has invalid digest '{digest}'"
                )
            if not digest:
                digest = None
        locks[source.name] = ServiceLock(
            image=image,
            tag=tag,
            digest=digest,
            source_branch=source_branch,
            published=published,
            notes=notes,
        )
    return locks


def load_env_lock() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_LOCK_FILE.exists():
        return values
    for raw_line in ENV_LOCK_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def short_ref(ref: str | None) -> str:
    if not ref:
        return "unpublished"
    if "@sha256:" in ref:
        prefix, digest = ref.split("@sha256:", 1)
        return f"{prefix}@sha256:{digest[:12]}"
    return ref


def build_resolved_refs(
    *,
    channel: str,
    modes: list[tuple[ServiceSource, str]],
) -> tuple[dict[str, str], dict[str, ServiceLock], list[str]]:
    locks = load_stack_lock(channel)
    refs: dict[str, str] = {}
    errors: list[str] = []
    for source, mode in modes:
        service_lock = locks[source.name]
        if service_lock.pinned_ref:
            refs[source.name] = service_lock.pinned_ref
            continue
        if mode == "local-source":
            refs[source.name] = service_lock.tag_ref
            continue
        extra = f" {service_lock.notes}" if service_lock.notes else ""
        errors.append(
            f"{source.display_name} lock for channel '{channel}' is not published yet "
            f"({service_lock.tag_ref}).{extra}".strip()
        )
    return refs, locks, errors


def write_env_lock(channel: str, refs: dict[str, str], locks: dict[str, ServiceLock]) -> None:
    lines = [
        "# Generated by scripts/compose_smart.py sync",
        f"COMPOSE_LOCK_CHANNEL={channel}",
    ]
    for source in SERVICE_SOURCES:
        resolved_ref = refs[source.name]
        service_lock = locks[source.name]
        lines.append(f"{source.env_var}={resolved_ref}")
        lines.append(f"{source.env_var}_TAG={service_lock.tag}")
        if service_lock.digest:
            lines.append(f"{source.env_var}_DIGEST={service_lock.digest}")
    ENV_LOCK_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    ENV_MIRROR_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def format_lock_detail(service_lock: ServiceLock) -> str:
    if service_lock.pinned_ref:
        return short_ref(service_lock.pinned_ref)
    suffix = "published=no" if not service_lock.published else "digest-missing"
    return f"{service_lock.tag_ref} ({suffix})"


def print_service_status(channel: str) -> int:
    modes = resolve_service_modes()
    locks = load_stack_lock(channel)
    env_values = load_env_lock()
    env_channel = env_values.get("COMPOSE_LOCK_CHANNEL")

    print(f"[compose-smart] Channel: {channel}")
    print(f"[compose-smart] Stack lock: {lock_path(channel)}")
    if env_values:
        print(
            f"[compose-smart] Synced env: {ENV_LOCK_FILE} "
            f"(channel={env_channel or 'unknown'})"
        )
    else:
        print("[compose-smart] Synced env: missing (run sync before image-only compose)")
    print("[compose-smart] Service source plan:")
    for source, mode in modes:
        service_lock = locks[source.name]
        mode_detail = "using local source" if mode == "local-source" else "using locked image"
        active = env_values.get(source.env_var)
        active_detail = f", active={short_ref(active)}" if active else ""
        print(
            f"  - {source.display_name}: {mode_detail}, "
            f"lock={format_lock_detail(service_lock)}{active_detail}"
        )
    return 0


def compose_override_files(modes: list[tuple[ServiceSource, str]]) -> list[str]:
    overrides: list[str] = []
    for source, mode in modes:
        if mode == "local-source" and source.override_file:
            print(
                f"[compose-smart] Detected local {source.display_name} source, "
                f"enabling {source.override_file}."
            )
            overrides.append(source.override_file)
    return overrides


def ensure_sync_ready(
    channel: str,
    modes: list[tuple[ServiceSource, str]],
) -> tuple[dict[str, str], dict[str, ServiceLock]]:
    refs, locks, errors = build_resolved_refs(channel=channel, modes=modes)
    if errors:
        joined = "\n".join(f"  - {message}" for message in errors)
        raise ValueError(
            "[compose-smart] Cannot continue because the stack lock is incomplete:\n"
            + joined
            + "\n[compose-smart] Publish the missing image or use local source for that service."
        )
    return refs, locks


def env_matches_refs(env_values: dict[str, str], refs: dict[str, str]) -> list[str]:
    mismatches: list[str] = []
    for source in SERVICE_SOURCES:
        expected = refs[source.name]
        actual = env_values.get(source.env_var)
        if actual != expected:
            mismatches.append(
                f"{source.env_var} expected {expected} but found {actual or 'missing'}"
            )
    return mismatches


def run_docker_pull(image_ref: str) -> None:
    result = subprocess.run(
        ["docker", "pull", image_ref],
        cwd=ROOT,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"Failed to pull locked image: {image_ref}")


def handle_sync(channel: str) -> int:
    modes = resolve_service_modes()
    refs, locks = ensure_sync_ready(channel, modes)
    print(f"[compose-smart] Syncing stack lock for channel '{channel}'")
    for source, mode in modes:
        if mode == "image":
            image_ref = refs[source.name]
            print(f"[compose-smart] Pulling {source.display_name}: {image_ref}")
            run_docker_pull(image_ref)
        else:
            print(
                f"[compose-smart] {source.display_name} uses local source; "
                f"recording {short_ref(refs[source.name])} for compose env completeness."
            )
    write_env_lock(channel, refs, locks)
    print(f"[compose-smart] Wrote {ENV_LOCK_FILE}")
    return 0


def build_compose_command(
    *,
    argv: list[str],
    channel: str,
) -> tuple[list[str], dict[str, str], dict[str, ServiceLock]]:
    modes = resolve_service_modes()
    refs, locks = ensure_sync_ready(channel, modes)
    if any(mode == "image" for _, mode in modes):
        env_values = load_env_lock()
        if not env_values:
            raise ValueError(
                "[compose-smart] Missing .env.compose.lock. Run "
                f"'python3 ./scripts/compose_smart.py sync --channel {channel}' first."
            )
        env_channel = env_values.get("COMPOSE_LOCK_CHANNEL")
        if env_channel != channel:
            raise ValueError(
                f"[compose-smart] .env.compose.lock is synced for channel '{env_channel}', "
                f"expected '{channel}'. Run sync again."
            )
        mismatches = env_matches_refs(env_values, refs)
        if mismatches:
            raise ValueError(
                "[compose-smart] .env.compose.lock does not match the current stack lock:\n"
                + "\n".join(f"  - {message}" for message in mismatches)
                + "\n[compose-smart] Run sync again."
            )

    overrides = compose_override_files(modes)
    command = ["docker", "compose"]
    if ENV_LOCK_FILE.exists():
        command.extend(["--env-file", str(ENV_LOCK_FILE)])
    for compose_file in BASE_FILES:
        command.extend(["-f", compose_file])
    if not overrides:
        print("[compose-smart] No local private service source detected, using lock-only compose.")
    else:
        print(
            "[compose-smart] Using compose overrides: "
            + " ".join(f"-f {name}" for name in overrides)
        )
        for compose_file in overrides:
            command.extend(["-f", compose_file])

    command.extend(argv)
    return command, refs, locks


def handle_doctor(channel: str) -> int:
    failures: list[str] = []

    if shutil.which("docker") is None:
        failures.append("docker is not installed or not on PATH")

    try:
        modes = resolve_service_modes()
        refs, locks = ensure_sync_ready(channel, modes)
    except ValueError as exc:
        failures.append(str(exc))
        modes = resolve_service_modes()
        refs = {}
        locks = {}

    env_values = load_env_lock()
    print(f"[compose-smart] Doctor for channel '{channel}'")
    for source, mode in modes:
        lock_detail = format_lock_detail(locks[source.name]) if source.name in locks else "unknown"
        print(
            f"  - {source.display_name}: "
            f"{'local source' if mode == 'local-source' else 'image mode'}; lock={lock_detail}"
        )

    if any(mode == "image" for _, mode in modes):
        if not env_values:
            failures.append(
                f"missing {ENV_LOCK_FILE}; run 'python3 ./scripts/compose_smart.py sync --channel {channel}'"
            )
        else:
            env_channel = env_values.get("COMPOSE_LOCK_CHANNEL")
            if env_channel != channel:
                failures.append(
                    f"{ENV_LOCK_FILE} is synced for channel '{env_channel}', expected '{channel}'"
                )
            if refs:
                mismatches = env_matches_refs(env_values, refs)
                failures.extend(mismatches)

    if not failures and shutil.which("docker") is not None:
        try:
            command, _, _ = build_compose_command(argv=["config"], channel=channel)
            result = subprocess.run(
                command,
                cwd=ROOT,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if result.returncode != 0:
                failures.append("docker compose config failed")
        except ValueError as exc:
            failures.append(str(exc))

    if failures:
        print("[compose-smart] Doctor FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("[compose-smart] Doctor OK")
    return 0


def extract_global_channel(argv: list[str]) -> tuple[str | None, list[str]]:
    if not argv:
        return None, []

    if argv[0] == "--channel":
        if len(argv) < 2:
            raise ValueError("Missing value for --channel")
        return argv[1], argv[2:]

    if argv[0].startswith("--channel="):
        return argv[0].split("=", 1)[1], argv[1:]

    return None, argv


def main() -> int:
    os.chdir(ROOT)
    try:
        raw_channel, argv = extract_global_channel(sys.argv[1:])
        channel = normalize_channel(raw_channel)
    except ValueError as exc:
        print(f"[compose-smart] {exc}", file=sys.stderr)
        return 1

    if not argv:
        print(
            "[compose-smart] Missing command. Use status, sync, doctor, or a docker compose command.",
            file=sys.stderr,
        )
        return 1

    command = argv[0]
    if command == "status":
        try:
            return print_service_status(channel)
        except ValueError as exc:
            print(f"[compose-smart] {exc}", file=sys.stderr)
            return 1
    if command == "sync":
        parser = argparse.ArgumentParser(prog="compose_smart.py sync")
        parser.add_argument("--channel", choices=sorted(VALID_CHANNELS), default=channel)
        args = parser.parse_args(argv[1:])
        try:
            return handle_sync(args.channel)
        except ValueError as exc:
            print(f"[compose-smart] {exc}", file=sys.stderr)
            return 1
    if command == "doctor":
        parser = argparse.ArgumentParser(prog="compose_smart.py doctor")
        parser.add_argument("--channel", choices=sorted(VALID_CHANNELS), default=channel)
        args = parser.parse_args(argv[1:])
        try:
            return handle_doctor(args.channel)
        except ValueError as exc:
            print(f"[compose-smart] {exc}", file=sys.stderr)
            return 1

    try:
        compose_command, _, _ = build_compose_command(argv=argv, channel=channel)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    completed = subprocess.run(compose_command, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
