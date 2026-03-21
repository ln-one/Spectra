from worker import _resolve_worker_name


def test_resolve_worker_name_appends_host_and_pid(monkeypatch):
    monkeypatch.setenv("WORKER_NAME", "worker-a")
    monkeypatch.setattr("worker.socket.gethostname", lambda: "demo-host.local")
    monkeypatch.setattr("worker.os.getpid", lambda: 4321)

    assert _resolve_worker_name() == "worker-a@demo-host:4321"


def test_resolve_worker_name_defaults_when_env_empty(monkeypatch):
    monkeypatch.delenv("WORKER_NAME", raising=False)
    monkeypatch.setattr("worker.socket.gethostname", lambda: "demo-host")
    monkeypatch.setattr("worker.os.getpid", lambda: 99)

    assert _resolve_worker_name() == "worker@demo-host:99"
