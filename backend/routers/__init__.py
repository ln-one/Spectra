from importlib import import_module

_ROUTER_MODULES = {
    "auth_router": ".auth",
    "chat_router": ".chat",
    "files_router": ".files",
    "generate_sessions_router": ".generate_sessions",
    "health_router": ".health",
    "project_space_router": ".project_space",
    "projects_router": ".projects",
    "rag_router": ".rag",
}

__all__ = [
    "auth_router",
    "chat_router",
    "files_router",
    "generate_sessions_router",
    "health_router",
    "project_space_router",
    "projects_router",
    "rag_router",
]


def __getattr__(name):
    module_name = _ROUTER_MODULES.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module = import_module(module_name, __name__)
    return getattr(module, "router")
