import logging

from utils.logger import ContextSafeFormatter


def test_context_safe_formatter_fills_missing_request_fields():
    formatter = ContextSafeFormatter(
        fmt=(
            "%(asctime)s - %(name)s - %(levelname)s "
            "[rid=%(request_id)s uid=%(user_id)s] %(message)s"
        )
    )
    record = logging.LogRecord(
        name="third.party",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="hello world",
        args=(),
        exc_info=None,
    )

    rendered = formatter.format(record)

    assert "rid=-" in rendered
    assert "uid=-" in rendered
    assert "hello world" in rendered
