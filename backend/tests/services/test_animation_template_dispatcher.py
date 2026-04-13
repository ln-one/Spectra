import json

import pytest

from services.artifact_generator.animation_template_dispatcher import (
    classify_topic_template,
    fill_template_slots,
    match_template,
    select_template,
)
from services.artifact_generator.animation_templates import (
    template_comparison,
    template_process_flow,
)
from services.artifact_generator.animation_templates_high_frequency import (
    template_data_flow,
)


async def _llm_classifier_stub(
    _system_prompt: str, user_prompt: str, _max_tokens: int
) -> str:
    topic_line = ""
    for line in user_prompt.splitlines():
        if line.strip().startswith("Topic:"):
            topic_line = line.lower()
            break

    if any(
        token in topic_line
        for token in ["photosynthesis", "respiration", "water cycle"]
    ):
        return json.dumps({"template": "scientific_process", "confidence": 0.9})
    if any(token in topic_line for token in ["cell cycle", "mitosis", "life cycle"]):
        return json.dumps({"template": "biological_cycle", "confidence": 0.9})
    if any(token in topic_line for token in ["data flow", "algorithm", "etl"]):
        return json.dumps({"template": "data_flow", "confidence": 0.9})
    if any(token in topic_line for token in ["tcp", "http", "dns"]):
        return json.dumps({"template": "protocol_exchange", "confidence": 0.85})
    return json.dumps({"template": "none", "confidence": 0.4})


async def _llm_slot_stub(
    _system_prompt: str, user_prompt: str, _max_tokens: int
) -> str:
    lowered = user_prompt.lower()
    if "scientific_process" in lowered:
        return json.dumps(
            {
                "title": "Water Cycle",
                "stages": ["Evaporation", "Condensation", "Precipitation"],
                "highlights": ["heat", "cloud", "rain"],
            }
        )
    if "biological_cycle" in lowered:
        return json.dumps(
            {
                "cycle_name": "Cell Cycle",
                "phases": ["G1", "S", "G2", "M"],
            }
        )
    if "data_flow" in lowered:
        return json.dumps(
            {
                "input_label": "Raw Data",
                "process_steps": ["Clean", "Feature", "Infer"],
                "output_label": "Prediction",
            }
        )
    return "{}"


@pytest.mark.asyncio
async def test_classify_topic_template_hits_specific_family():
    spec = {"topic": "Photosynthesis process animation"}

    template = await classify_topic_template(spec, _llm_classifier_stub)

    assert template == "scientific_process"


@pytest.mark.asyncio
async def test_select_template_falls_back_to_keyword_match_when_classifier_miss():
    async def llm_miss(*_args, **_kwargs):
        return json.dumps({"template": "none", "confidence": 0.2})

    spec = {"topic": "TCP handshake flow", "subject_family": "protocol_exchange"}

    selected = await select_template(spec, llm_miss)

    assert selected is not None
    assert selected[0] == "protocol_exchange"


@pytest.mark.asyncio
async def test_fill_template_slots_supports_new_templates():
    spec = {"topic": "Water cycle", "scenes": [], "object_details": []}

    scientific = await fill_template_slots("scientific_process", spec, _llm_slot_stub)
    biological = await fill_template_slots("biological_cycle", spec, _llm_slot_stub)
    data_flow = await fill_template_slots("data_flow", spec, _llm_slot_stub)

    assert scientific["stages"][0] == "Evaporation"
    assert biological["phases"][-1] == "M"
    assert data_flow["output_label"] == "Prediction"


@pytest.mark.asyncio
async def test_template_coverage_benchmark_reaches_70_percent():
    topics = [
        "Photosynthesis in plants",
        "Cell cycle phases",
        "Data flow in recommendation algorithm",
        "TCP three-way handshake",
        "Water cycle process",
        "Life cycle of butterfly",
        "ETL data pipeline",
        "Sorting algorithm walkthrough",
        "General classroom motivation intro",
        "Poetry appreciation lesson",
    ]

    hits = 0
    for topic in topics:
        spec = {"topic": topic, "subject_family": ""}
        selected = await select_template(spec, _llm_classifier_stub)
        if selected is not None:
            hits += 1

    coverage = hits / len(topics)
    assert coverage >= 0.70


def test_match_template_supports_new_keyword_fallbacks():
    assert match_template("water cycle in nature", {})[0] == "scientific_process"
    assert match_template("cell cycle and mitosis", {})[0] == "biological_cycle"
    assert match_template("algorithm data flow chart", {})[0] == "data_flow"


def test_core_templates_emit_icon_objects():
    process_result = template_process_flow({"stages": ["输入", "处理", "输出"]})
    comparison_result = template_comparison(
        {
            "left_title": "方案A",
            "right_title": "方案B",
            "left_points": ["快", "简单"],
            "right_points": ["稳", "可扩展"],
        }
    )
    data_flow_result = template_data_flow(
        {
            "input_label": "原始数据",
            "process_steps": ["清洗", "建模"],
            "output_label": "结果",
        }
    )

    assert any(obj.get("type") == "icon" for obj in process_result["objects"])
    assert any(obj.get("type") == "icon" for obj in comparison_result["objects"])
    assert any(obj.get("type") == "icon" for obj in data_flow_result["objects"])
