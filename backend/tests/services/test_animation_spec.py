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
    assert spec["scenes"][0]["transition"] == "dissolve"
    assert spec["scenes"][1]["transition"] == "soft_wipe"
    assert spec["scenes"][2]["transition"] == "dissolve"


def test_normalize_animation_spec_uses_relationship_template_for_change_topics():
    spec = normalize_animation_spec(
        {
            "title": "温度变化规律动画",
            "summary": "展示变量变化趋势和拐点",
            "focus": "突出关键转折",
        }
    )

    assert spec["visual_type"] == "relationship_change"
    assert spec["scenes"][0]["transition"] == "dissolve"


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


def test_normalize_animation_spec_uses_minimal_gray_style_pack_by_default():
    spec = normalize_animation_spec(
        {
            "title": "新手引导动画",
            "summary": "通过角色讲解课堂流程",
            "focus": "强调课堂互动节奏",
        }
    )

    assert spec["style_pack"] == "teaching_ppt_minimal_gray"
    assert spec["theme"]["background"] == "#eef1f4"
    assert spec["theme"]["accent_deep"] == "#2f3f50"


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


def test_normalize_animation_spec_accepts_deep_blue_style_pack():
    spec = normalize_animation_spec(
        {
            "title": "HTTP 请求响应流程",
            "summary": "强调请求路径和响应返回",
            "style_pack": "teaching_ppt_deep_blue",
        }
    )

    assert spec["style_pack"] == "teaching_ppt_deep_blue"
    assert spec["theme"]["background"] == "#dfeaf6"
    assert spec["theme"]["accent_deep"] == "#0f2f4f"


def test_normalize_animation_spec_maps_style_pack_alias_to_new_theme():
    spec = normalize_animation_spec(
        {
            "title": "数据库事务流程",
            "summary": "展示提交与回滚",
            "style_pack": "warm_orange",
        }
    )

    assert spec["style_pack"] == "teaching_ppt_warm_orange"
    assert spec["theme"]["background"] == "#f7e9d8"


def test_normalize_animation_spec_respects_explicit_physics_family_hint():
    spec = normalize_animation_spec(
        {
            "title": "斜抛运动中的速度与轨迹",
            "summary": "观察物体抛出后的位移、速度变化和轨迹。",
            "focus": "突出重力作用下的轨迹和速度矢量。",
            "animation_family": "physics_mechanics",
        }
    )

    assert spec["animation_family"] == "physics_mechanics"
    assert spec["family_hint"] == "physics_mechanics"
    assert spec["subject_family"] == "energy_transfer"


def test_normalize_animation_spec_prefers_physics_family_for_motion_keywords():
    spec = normalize_animation_spec(
        {
            "title": "斜抛运动中的速度与轨迹",
            "summary": "展示抛物线轨迹、速度变化和重力影响。",
            "focus": "强调速度矢量、位移和加速度之间的关系。",
        }
    )

    assert spec["animation_family"] == "physics_mechanics"
    assert spec["family_hint"] == "physics_mechanics"
    assert spec["subject_family"] == "energy_transfer"


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


def test_normalize_animation_spec_uses_keyword_title_from_user_request():
    spec = normalize_animation_spec(
        {
            "title": "请给我制作一个光合作用演示动画",
            "topic": "光合作用过程演示动画",
            "motion_brief": "展示光能输入、物质转化和产物输出",
        }
    )

    assert spec["title"] == "光合作用过程"


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
    assert spec["subject_family"] == "protocol_exchange"
    assert spec["layout_type"] == "two_party_sequence"
    assert spec["object_details"][0]["kind"] == "endpoint"
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


def test_normalize_animation_spec_assigns_traversal_family_semantics():
    spec = normalize_animation_spec(
        {
            "title": "二叉树前序遍历动画演示",
            "summary": "展示根节点开始依次访问左右子树的过程",
            "focus": "突出访问路径和结果序列",
        }
    )

    assert spec["subject_family"] == "traversal_path"
    assert spec["layout_type"] == "traversal_map"
    assert spec["object_details"]
    assert spec["scenes"][0]["scene_actions"]
    assert spec["scenes"][1]["focus_target"]


def test_normalize_animation_spec_assigns_energy_family_semantics():
    spec = normalize_animation_spec(
        {
            "title": "新能源汽车电池能量流全过程演示",
            "summary": "制作从充电到驱动车轮的能量传递动画",
            "focus": "突出储能、转换和输出过程",
        }
    )

    assert spec["subject_family"] == "energy_transfer"
    assert spec["layout_type"] == "energy_track"
    assert [item["kind"] for item in spec["object_details"]][:2] == [
        "source",
        "channel",
    ]


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


def test_normalize_animation_spec_builds_algorithm_demo_for_bubble_sort():
    spec = normalize_animation_spec(
        {
            "title": "冒泡排序演示动画",
            "summary": "展示比较与交换过程",
            "focus": "突出每一轮如何把最大值推到末尾",
        }
    )

    assert spec["animation_family"] == "algorithm_demo"
    assert spec["algorithm_type"] == "bubble_sort"
    assert spec["layout_type"] == "algorithm_bars"
    assert spec["family_hint"] == "algorithm_demo"
    assert spec["scenes"]


def test_normalize_animation_spec_builds_algorithm_demo_for_binary_search():
    spec = normalize_animation_spec(
        {
            "title": "二分查找教学动画",
            "summary": "展示查找区间如何不断缩小",
            "focus": "突出中点比较和区间收缩",
        }
    )

    assert spec["animation_family"] == "algorithm_demo"
    assert spec["algorithm_type"] == "binary_search"
    assert spec["layout_type"] == "algorithm_window"
    assert spec["family_hint"] == "algorithm_demo"
    assert spec["scenes"]


def test_normalize_animation_spec_supports_deterministic_algorithm_seed_debug_mode():
    spec = normalize_animation_spec(
        {
            "title": "冒泡排序演示动画",
            "summary": "展示比较与交换过程",
            "focus": "突出每一轮如何把最大值推到末尾",
            "use_deterministic_algorithm_seed": True,
        }
    )

    assert spec["animation_family"] == "algorithm_demo"
    assert spec["algorithm_type"] == "bubble_sort"
    assert spec["steps"][0]["action"] == "compare"
    assert spec["steps"][-1]["snapshot"] == [2, 3, 5, 6, 8]
