import json
import logging
import re

from schemas.intent import IntentClassification, IntentType, ModifyIntent, ModifyType
from services.ai.model_router import ModelRouteTask

logger = logging.getLogger(__name__)


async def classify_intent(service, user_message: str) -> IntentClassification:
    from services.prompt_service import prompt_service

    try:
        prompt = prompt_service.build_intent_prompt(user_message)
        response = await service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.INTENT_CLASSIFICATION,
            max_tokens=200,
        )
        content = response["content"].strip()
        parsed = json.loads(content)
        intent_str = parsed.get("intent", "general_chat")
        confidence = float(parsed.get("confidence", 0.8))
        return IntentClassification(
            intent=IntentType(intent_str),
            confidence=confidence,
            method="llm",
        )
    except Exception as e:
        logger.warning("LLM intent classification failed: %s, using fallback", e)
        try:
            return service._classify_intent_by_keywords(user_message)
        except Exception as fallback_exc:
            logger.error(
                "Keyword intent fallback failed: %s", fallback_exc, exc_info=True
            )
            return IntentClassification(
                intent=IntentType.GENERAL_CHAT,
                confidence=0.0,
                method="keyword_fallback",
            )


def classify_intent_by_keywords(message: str) -> IntentClassification:
    msg = message.lower()

    modify_keywords = ["修改", "改一下", "换成", "调整", "删除", "添加", "替换"]
    if any(kw in msg for kw in modify_keywords):
        return IntentClassification(
            intent=IntentType.MODIFY_COURSEWARE,
            confidence=0.6,
            method="keyword_fallback",
        )

    confirm_keywords = ["生成", "开始", "确认", "好的", "可以", "就这样"]
    if any(kw in msg for kw in confirm_keywords):
        return IntentClassification(
            intent=IntentType.CONFIRM_GENERATION,
            confidence=0.6,
            method="keyword_fallback",
        )

    question_keywords = ["吗", "什么", "怎么", "如何", "为什么", "能不能", "？", "?"]
    if any(kw in msg for kw in question_keywords):
        return IntentClassification(
            intent=IntentType.ASK_QUESTION,
            confidence=0.5,
            method="keyword_fallback",
        )

    requirement_keywords = [
        "课件",
        "主题",
        "关于",
        "内容",
        "PPT",
        "ppt",
        "教学",
        "讲解",
        "介绍",
    ]
    if any(kw in msg for kw in requirement_keywords):
        return IntentClassification(
            intent=IntentType.DESCRIBE_REQUIREMENT,
            confidence=0.5,
            method="keyword_fallback",
        )

    return IntentClassification(
        intent=IntentType.GENERAL_CHAT,
        confidence=0.4,
        method="keyword_fallback",
    )


async def parse_modify_intent(service, instruction: str) -> ModifyIntent:
    try:
        prompt = f"""你是 Spectra 课件修改指令分类器。请分析这条修改指令，并判断修改类型与目标页码。

<modify_intent_task>
  <instruction>{instruction}</instruction>
</modify_intent_task>

<modify_types>
- content: 修改文字内容，如改标题、改文案、改要点、补例子
- style: 修改风格或样式，如改颜色、改字体、改排版、改模板
- structure: 修改结构，如加页、删页、调整顺序、拆分页面
- global: 对整份课件做全局修改，如整体改风格、整体改主题
</modify_types>

<decision_rules>
1. 如果指令包含明确页码，优先提取到 `target_slides`。
2. 如果只是改颜色、字体、模板、主题色，优先判为 `style`，不要误判为 `global`。
3. 如果要求加页、删页、换顺序，判为 `structure`。
4. 如果要求整体改风格、整体统一主题，而没有指定页码，判为 `global`。
5. 其余默认判为 `content`。
</decision_rules>

严格只返回 JSON：
{{"modify_type": "content|style|structure|global", "target_slides": [页码数字] 或 null}}"""
        response = await service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.INTENT_CLASSIFICATION,
            max_tokens=200,
        )
        content = response["content"].strip()
        parsed = json.loads(content)
        modify_type = ModifyType(parsed.get("modify_type", "content"))
        raw_slides = parsed.get("target_slides")
        target_slides = [int(s) for s in raw_slides] if raw_slides else None
        return ModifyIntent(
            modify_type=modify_type,
            target_slides=target_slides,
            instruction=instruction,
        )
    except Exception as e:
        logger.warning("LLM modify intent parse failed: %s, using fallback", e)
        try:
            return service._parse_modify_intent_by_keywords(instruction)
        except Exception as fallback_exc:
            logger.error(
                "Keyword modify fallback failed: %s", fallback_exc, exc_info=True
            )
            return ModifyIntent(
                modify_type=ModifyType.CONTENT,
                target_slides=None,
                instruction=instruction,
            )


def parse_modify_intent_by_keywords(instruction: str) -> ModifyIntent:
    msg = instruction.lower()
    target_slides = None
    page_patterns = [
        r"第\s*(\d+)\s*页",
        r"第\s*(\d+)\s*张",
        r"slide\s*(\d+)",
        r"第\s*(\d+)\s*[个]?幻灯片",
    ]
    found_pages = []
    for pat in page_patterns:
        found_pages.extend(int(m) for m in re.findall(pat, msg))
    if found_pages:
        target_slides = sorted(set(found_pages))

    style_kw = ["风格", "模板", "颜色", "字体", "排版", "样式", "主题色"]
    structure_kw = ["添加一页", "加一页", "删除一页", "删掉", "增加一页", "调整顺序"]
    has_structure = any(kw in msg for kw in structure_kw)
    has_style = any(kw in msg for kw in style_kw)
    has_global_scope = any(kw in msg for kw in ["整体", "全部", "所有", "全局"])
    has_global_theme = "主题" in msg and "主题色" not in msg

    if has_structure:
        modify_type = ModifyType.STRUCTURE
    elif (has_global_scope or has_global_theme) and not target_slides:
        modify_type = ModifyType.GLOBAL
    elif has_style:
        modify_type = ModifyType.STYLE
    else:
        modify_type = ModifyType.CONTENT

    return ModifyIntent(
        modify_type=modify_type,
        target_slides=target_slides,
        instruction=instruction,
    )
