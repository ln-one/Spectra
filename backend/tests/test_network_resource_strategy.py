from services.network_resource_strategy import (
    audio_segments_to_units,
    canonicalize_url,
    dedupe_web_resources,
    prepare_web_knowledge_units,
    rank_units_by_relevance,
    video_segments_to_units,
)


def test_canonicalize_url_and_dedupe():
    resources = [
        {
            "id": "a",
            "title": "T1",
            "url": "https://example.com/page?utm_source=x&id=1",
            "content": "教学内容 A " * 10,
        },
        {
            "id": "b",
            "title": "T1",
            "url": "https://example.com/page?id=1",
            "content": "教学内容 A " * 10,
        },
    ]
    assert canonicalize_url(resources[0]["url"]) == "https://example.com/page?id=1"
    deduped = dedupe_web_resources(resources)
    assert len(deduped) == 1


def test_prepare_web_knowledge_units_filters_low_quality():
    resources = [
        {
            "id": "good",
            "title": "牛顿第二定律课堂活动",
            "url": "https://example.com/newton",
            "content": "牛顿第二定律实验活动设计，包含课堂提问和误区纠正。 " * 4,
        },
        {
            "id": "bad",
            "title": "广告",
            "url": "https://spam.example.com",
            "content": "点我",
        },
    ]
    units = prepare_web_knowledge_units(resources, query="牛顿第二定律 课堂实验")
    kept_ids = {(u.get("metadata") or {}).get("resource_id") for u in units}
    assert "good" in kept_ids
    assert "bad" not in kept_ids


def test_audio_segments_to_units_cleans_and_filters():
    segments = [
        {
            "start": 0.0,
            "end": 5.0,
            "text": "嗯 今天我们先做导入提问，然后进入实验。",
            "confidence": 0.9,
        },
        {"start": 5.0, "end": 6.0, "text": "啊 那个", "confidence": 0.2},
    ]
    units = audio_segments_to_units("a1", "lesson.wav", segments)
    assert len(units) == 1
    assert "嗯" not in units[0]["content"]
    assert units[0]["citation"]["timestamp"] == 0.0


def test_video_segments_to_units_keeps_key_points():
    segments = [
        {
            "start": 10.0,
            "end": 20.0,
            "summary": "讲解细胞分裂。",
            "key_points": ["有丝分裂阶段", "染色体分离"],
            "confidence": 0.88,
        }
    ]
    units = video_segments_to_units("v1", "cell.mp4", segments)
    assert len(units) == 1
    assert "有丝分裂阶段" in units[0]["content"]
    assert units[0]["citation"]["timestamp"] == 10.0


def test_rank_units_by_relevance():
    units = [
        {
            "chunk_id": "u1",
            "source_type": "web",
            "content": "讲解牛顿第二定律和实验设计。",
            "metadata": {},
            "citation": {"chunk_id": "u1", "source_type": "web", "filename": "a"},
        },
        {
            "chunk_id": "u2",
            "source_type": "web",
            "content": "介绍植物光合作用过程。",
            "metadata": {},
            "citation": {"chunk_id": "u2", "source_type": "web", "filename": "b"},
        },
    ]
    ranked = rank_units_by_relevance(units, query="牛顿第二定律 教学")
    assert ranked[0]["chunk_id"] == "u1"
