"""Intent classification prompt helpers."""

from .escaping import escape_prompt_text


def build_intent_prompt(user_message: str) -> str:
    """Build prompt for intent classification."""
    return f"""你是 Spectra 教学课件助手的意图分类器。你的任务不是回复用户，而是稳定判断当前消息最主要的意图。

<intent_task>
  <user_message>{escape_prompt_text(user_message)}</user_message>
</intent_task>

<intent_candidates>
- describe_requirement: 用户在描述课件主题、教学目标、内容范围、风格要求或资料使用要求
- ask_question: 用户在提问、追问、澄清、咨询怎么做
- modify_courseware: 用户在要求修改已有课件或大纲
- confirm_generation: 用户在确认开始生成、继续生成、接受当前方案
- general_chat: 其余寒暄、开放式闲聊、无法归入以上四类
</intent_candidates>

<decision_rules>
1. 只选一个最主要意图，不要返回多个标签。
2. 只要消息明确要求“改标题/改顺序/加一页/整体改风格”等，优先判为 `modify_courseware`。
3. 只要消息明确表示“开始生成/确认/就这样/按这个来”，优先判为 `confirm_generation`。
4. 如果消息同时包含需求描述和问题，优先判断老师此刻更想“继续澄清”还是“直接给需求”；拿不准时优先 `ask_question`。
5. 不要因为出现“课件/PPT”字样就机械判为 `describe_requirement`。
</decision_rules>

严格只返回 JSON：
{{"intent":"<one_intent>","confidence":0.0}}"""
