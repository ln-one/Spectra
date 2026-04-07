from services.artifact_generator.animation_spec import normalize_animation_spec


def test_normalize_animation_spec_prefers_structure_breakdown_for_network_layers():
    spec = normalize_animation_spec(
        {
            "title": "计算机网络分层结构动画演示",
            "summary": "做一个动画展示计算机网络的层次结构",
            "focus": "突出应用层到物理层的职责差异",
        }
    )

    assert spec["visual_type"] == "structure_breakdown"
    assert spec["objects"] == [
        "应用层",
        "传输层",
        "网络层",
        "数据链路层",
        "物理层",
    ]
    assert spec["object_details"][0]["label"] == "应用层"
    assert "HTTP" in spec["object_details"][0]["role"]
    assert spec["scenes"][0]["title"] == "先看整体结构"
    assert "应用层" in spec["scenes"][0]["description"]
    assert spec["scenes"][1]["focus_sequence"][0] == "应用层"


def test_normalize_animation_spec_uses_relationship_template_for_change_topics():
    spec = normalize_animation_spec(
        {
            "title": "温度变化规律动画",
            "summary": "展示变量变化趋势和拐点",
            "focus": "突出关键转折",
        }
    )

    assert spec["visual_type"] == "relationship_change"
