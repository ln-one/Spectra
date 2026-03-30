import json

from services.generation_session_service.capability_helpers import (
    _extract_template_config,
)


def test_extract_template_config_with_rag_source_ids():
    """验证 rag_source_ids 从 options 透传到 template_config"""
    options = {
        "template_config": {"style": "default"},
        "rag_source_ids": ["file-1", "file-2"],
    }
    options_raw = json.dumps(options)
    result = _extract_template_config(options_raw)
    assert result is not None
    assert result["style"] == "default"
    assert result["rag_source_ids"] == ["file-1", "file-2"]


def test_extract_template_config_with_selected_file_ids_fallback():
    options = {
        "template_config": {"style": "default"},
        "selected_file_ids": ["file-3", "file-4"],
    }
    result = _extract_template_config(json.dumps(options))
    assert result is not None
    assert result["style"] == "default"
    assert result["rag_source_ids"] == ["file-3", "file-4"]


def test_extract_template_config_with_nested_options_fallback():
    options = {
        "template_config": {"style": "gaia"},
        "options": {"source_ids": ["file-5"]},
    }
    result = _extract_template_config(json.dumps(options))
    assert result is not None
    assert result["style"] == "gaia"
    assert result["rag_source_ids"] == ["file-5"]


def test_extract_template_config_without_rag_source_ids():
    """验证没有 rag_source_ids 时正常工作"""
    options = {"template_config": {"style": "gaia"}}
    options_raw = json.dumps(options)
    result = _extract_template_config(options_raw)
    assert result is not None
    assert result["style"] == "gaia"
    assert "rag_source_ids" not in result


def test_extract_template_config_empty_rag_source_ids():
    """验证空 rag_source_ids 不会被添加"""
    options = {"template_config": {"style": "default"}, "rag_source_ids": []}
    options_raw = json.dumps(options)
    result = _extract_template_config(options_raw)
    assert result is not None
    assert result["style"] == "default"
    assert "rag_source_ids" not in result


def test_extract_template_config_no_template_config():
    """验证只有 rag_source_ids 时也能返回"""
    options = {"rag_source_ids": ["file-1"]}
    options_raw = json.dumps(options)
    result = _extract_template_config(options_raw)
    assert result is not None
    assert result["rag_source_ids"] == ["file-1"]


def test_extract_template_config_null_options():
    """验证 null options 返回 None"""
    assert _extract_template_config(None) is None
    assert _extract_template_config("") is None


def test_extract_template_config_invalid_json():
    """验证无效 JSON 返回 None"""
    assert _extract_template_config("{invalid}") is None
