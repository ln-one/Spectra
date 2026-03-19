def _resolve_model_name(model: str) -> str:
    """Normalize model names for LiteLLM provider prefixes."""
    if model.startswith(("qwen-", "qwen2", "qwen3")) and not model.startswith(
        "dashscope/"
    ):
        return f"dashscope/{model}"

    minimax_aliases = {
        "minimax-m2.5": "MiniMax-M2.5",
        "minimax-m2.5-lightning": "MiniMax-M2.5-lightning",
        "minimax-m2.1": "MiniMax-M2.1",
        "minimax-m2.1-lightning": "MiniMax-M2.1-lightning",
        "minimax-m2": "MiniMax-M2",
    }
    lowered = model.lower()
    if lowered in minimax_aliases:
        return f"minimax/{minimax_aliases[lowered]}"
    if model.startswith("minimax/"):
        _, suffix = model.split("/", 1)
        canonical = minimax_aliases.get(suffix.lower())
        if canonical:
            return f"minimax/{canonical}"
    if model.startswith(("MiniMax-", "minimax-")) and not model.startswith("minimax/"):
        return f"minimax/{model}"
    return model
