import json
import logging

from schemas.intent import IntentClassification, IntentType, ModifyIntent, ModifyType
from services.ai.model_router import ModelRouteTask
from services.prompt_service.escaping import escape_prompt_text

logger = logging.getLogger(__name__)


async def classify_intent(service, user_message: str) -> IntentClassification:
    from services.prompt_service import prompt_service

    try:
        prompt = prompt_service.build_intent_prompt(user_message)
        response = await service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.INTENT_CLASSIFICATION,
            max_tokens=2000,
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
        logger.warning("LLM intent classification failed: %s", e)
        return IntentClassification(
            intent=IntentType.GENERAL_CHAT,
            confidence=0.0,
            method="llm_error",
        )


async def parse_modify_intent(service, instruction: str) -> ModifyIntent:
    try:
        prompt = f"""你是 Spectra 课件修改指令分类器。请分析这条修改指令，并判断修改类型与目标页码。

<modify_intent_task>
  <instruction>{escape_prompt_text(instruction)}</instruction>
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
            max_tokens=2000,
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
        logger.warning("LLM modify intent parse failed: %s", e)
        return ModifyIntent(
            modify_type=ModifyType.CONTENT,
            target_slides=None,
            instruction=instruction,
        )
