"""Intent classification prompt helpers."""


def build_intent_prompt(user_message: str) -> str:
    """Build prompt for intent classification."""
    return f"""You are an intent classifier for an education courseware assistant.
User message: {user_message}

Intent candidates (pick one):
- describe_requirement
- ask_question
- modify_courseware
- confirm_generation
- general_chat

Return JSON only:
{{"intent":"<one_intent>","confidence":0.0}}"""
