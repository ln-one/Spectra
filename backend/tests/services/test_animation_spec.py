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
    assert spec["scenes"][0]["transition"] == "fade"
    assert spec["scenes"][1]["transition"] == "slide"
    assert spec["scenes"][2]["transition"] == "zoom"


def test_normalize_animation_spec_uses_relationship_template_for_change_topics():
    spec = normalize_animation_spec(
        {
            "title": "温度变化规律动画",
            "summary": "展示变量变化趋势和拐点",
            "focus": "突出关键转折",
        }
    )

    assert spec["visual_type"] == "relationship_change"
    assert spec["scenes"][0]["transition"] == "fade"


def test_normalize_animation_spec_supports_osi_layers_and_encapsulation():
    spec = normalize_animation_spec(
        {
            "title": "计算机网络 OSI 七层模型与封装流程",
            "summary": "讲解各层职责以及数据发送时的逐层封装过程",
            "focus": "突出应用层到物理层的分工，以及发送和接收方向的差异",
        }
    )

    assert spec["visual_type"] == "structure_breakdown"
    assert spec["objects"] == [
        "应用层",
        "表示层",
        "会话层",
        "传输层",
        "网络层",
        "数据链路层",
        "物理层",
    ]
    assert spec["object_details"][1]["label"] == "表示层"
    assert "编码转换" in spec["object_details"][1]["role"]
    assert "逐层封装" in spec["scenes"][2]["description"]


def test_normalize_animation_spec_uses_teaching_ppt_style_pack_by_default():
    spec = normalize_animation_spec(
        {
            "title": "新手引导动画",
            "summary": "通过角色讲解课堂流程",
            "focus": "强调课堂互动节奏",
        }
    )

    assert spec["style_pack"] == "teaching_ppt_cartoon"
    assert spec["theme"]["background"] == "#f3c453"
    assert spec["theme"]["accent_deep"] == "#17334e"


def test_normalize_animation_spec_accepts_fresh_green_style_pack():
    spec = normalize_animation_spec(
        {
            "title": "网络分层讲解",
            "summary": "强调分层协作",
            "style_pack": "teaching_ppt_fresh_green",
        }
    )

    assert spec["style_pack"] == "teaching_ppt_fresh_green"
    assert spec["theme"]["background"] == "#f5f8f3"


def test_normalize_animation_spec_supports_variable_scene_count_for_long_duration():
    spec = normalize_animation_spec(
        {
            "title": "计算机网络 OSI 七层模型与封装流程",
            "summary": "讲解各层职责以及数据发送时的逐层封装过程",
            "focus": "突出应用层到物理层分工",
            "duration_seconds": 14,
        }
    )

    assert spec["visual_type"] == "structure_breakdown"
    assert len(spec["scenes"]) >= 4
    shot_types = [scene.get("shot_type") for scene in spec["scenes"]]
    assert shot_types[0] == "intro"
    assert shot_types[-1] == "summary"
    assert shot_types.count("focus") >= 2


def test_normalize_animation_spec_strips_request_style_copy_from_display_text():
    spec = normalize_animation_spec(
        {
            "title": "TCP 三次握手连接建立流程演示",
            "summary": "请给我制作一个TCP三次握手展示动画",
            "focus": "突出 SYN、SYN-ACK、ACK 三次报文交换",
        }
    )

    assert spec["summary"] == ""
    assert "请给我制作一个" not in spec["teaching_goal"]


def test_normalize_animation_spec_drops_request_sentence_summary():
    spec = normalize_animation_spec(
        {
            "title": "TCP 三次握手连接建立流程演示",
            "summary": "请生成TCP三次握手的演示动画",
            "focus": "突出 SYN、SYN-ACK、ACK 三次报文交换",
        }
    )

    assert spec["summary"] == ""


def test_normalize_animation_spec_uses_protocol_step_scenes_for_tcp_handshake():
    spec = normalize_animation_spec(
        {
            "title": "TCP three-way handshake demo",
            "summary": "show SYN SYN-ACK ACK transitions",
            "focus": "highlight SYN and ACK state transitions",
        }
    )

    assert spec["visual_type"] == "process_flow"
    assert len(spec["scenes"]) == 3
    assert [scene["shot_type"] for scene in spec["scenes"]] == [
        "intro",
        "focus",
        "summary",
    ]
    assert [scene["camera"] for scene in spec["scenes"]] == [
        "wide",
        "close",
        "zoom_out",
    ]
    assert "SYN" in spec["scenes"][0]["title"]
    assert "SYN" in spec["scenes"][1]["title"]
    assert "ACK" in spec["scenes"][2]["title"]


def test_normalize_animation_spec_assigns_camera_language_to_generic_process_scenes():
    spec = normalize_animation_spec(
        {
            "title": "缓存一致性流程动画",
            "summary": "展示写入、失效、广播与回读流程",
            "focus": "强调总览、关键步骤和结论回收",
            "duration_seconds": 8,
        }
    )

    assert spec["visual_type"] == "process_flow"
    assert spec["scenes"][0]["camera"] == "wide"
    assert spec["scenes"][-1]["camera"] == "zoom_out"
    assert all(scene.get("camera") for scene in spec["scenes"])


def test_normalize_animation_spec_respects_requested_scene_count_constraint():
    spec = normalize_animation_spec(
        {
            "title": "缓存一致性流程演示",
            "summary": "展示写入、失效、广播与回读流程",
            "focus": "至少5段，分步骤讲清楚每一段",
            "duration_seconds": 6,
        }
    )

    assert spec["visual_type"] == "process_flow"
    assert len(spec["scenes"]) >= 5


def test_normalize_animation_spec_enforces_intro_and_summary_for_custom_scenes():
    spec = normalize_animation_spec(
        {
            "title": "数据库事务：提交与回滚流程演示",
            "summary": "展示事务从初始化、执行、校验、提交到回滚的过程",
            "scenes": [
                {"title": "事务初始化", "description": "创建事务上下文"},
                {"title": "执行数据变更", "description": "写入变更集"},
                {"title": "完整性校验", "description": "检查约束条件"},
                {"title": "持久化提交", "description": "刷盘并提交"},
            ],
        }
    )

    assert [scene["shot_type"] for scene in spec["scenes"]] == [
        "intro",
        "focus",
        "focus",
        "summary",
    ]
    assert spec["scenes"][0]["camera"] == "wide"
    assert spec["scenes"][-1]["camera"] == "zoom_out"
