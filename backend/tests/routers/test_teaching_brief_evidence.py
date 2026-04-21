from routers.chat.teaching_brief_evidence import build_recent_requirement_evidence


def test_build_recent_requirement_evidence_extracts_lesson_hours_and_audience():
    evidence = build_recent_requirement_evidence(
        history_payload=[
            {"role": "user", "content": "10个课时讲完，讲解关键算法"},
            {"role": "assistant", "content": "好的，按10个课时安排。"},
            {"role": "user", "content": "面向软件工程的大二学生"},
        ],
        latest_user_message='只需"理解原理"',
    )

    assert evidence["lesson_hours"] == 10
    assert evidence["duration_or_pages"] == "10课时"
    assert evidence["audience"] == "软件工程的大二学生"
    assert evidence["teaching_objectives"] == ["理解原理"]


def test_build_recent_requirement_evidence_extracts_strategy():
    evidence = build_recent_requirement_evidence(
        history_payload=[],
        latest_user_message="暂时不讲代码的部分",
    )

    assert evidence["teaching_strategy"] == "不讲代码实现，侧重算法原理讲解"
