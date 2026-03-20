from datetime import datetime, timezone
from types import SimpleNamespace

from services.project_space_service.candidate_change_semantics import (
    extract_accepted_version_id,
    parse_json_object,
    serialize_candidate_change,
)

_NOW = datetime.now(timezone.utc)


def _fake_change(payload):
    return SimpleNamespace(
        id="chg-001",
        projectId="proj-001",
        sessionId="sess-001",
        baseVersionId="ver-001",
        title="candidate",
        summary="summary",
        payload=payload,
        status="accepted",
        reviewComment="looks good",
        proposerUserId="user-001",
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def test_parse_json_object_accepts_dict_and_json_string():
    assert parse_json_object({"a": 1}) == {"a": 1}
    assert parse_json_object('{"a": 1}') == {"a": 1}


def test_extract_accepted_version_id_from_nested_review_payload():
    assert (
        extract_accepted_version_id({"review": {"accepted_version_id": "ver-009"}})
        == "ver-009"
    )


def test_serialize_candidate_change_projects_shared_semantics():
    change = _fake_change('{"review":{"accepted_version_id":"ver-002"}}')
    payload = serialize_candidate_change(change, isoformat_datetimes=False)

    assert payload["accepted_version_id"] == "ver-002"
    assert payload["review_comment"] == "looks good"
    assert payload["created_at"] == _NOW


def test_serialize_candidate_change_can_emit_isoformat_datetimes():
    change = _fake_change({"review": {"accepted_version_id": "ver-003"}})
    payload = serialize_candidate_change(change, isoformat_datetimes=True)

    assert payload["accepted_version_id"] == "ver-003"
    assert payload["created_at"] == _NOW.isoformat()
