from __future__ import annotations

import os
from typing import Any

import httpx

from utils.exceptions import APIException, ErrorCode

_PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"


def pexels_enabled() -> bool:
    return bool(str(os.getenv("PEXELS_API_KEY") or "").strip())


async def search_pexels_images(query: str, *, per_page: int = 4) -> dict[str, Any]:
    query_text = str(query or "").strip()
    if not query_text:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="q is required",
        )
    api_key = str(os.getenv("PEXELS_API_KEY") or "").strip()
    if not api_key:
        raise APIException(
            status_code=503,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            message="PEXELS_API_KEY 未配置，图片搜索不可用",
        )

    params = {"query": query_text, "per_page": max(1, min(int(per_page or 4), 4)), "page": 1}
    headers = {"Authorization": api_key}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(_PEXELS_SEARCH_URL, params=params, headers=headers)
    except httpx.TimeoutException as exc:
        raise APIException(
            status_code=504,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            message="Pexels 搜索超时",
        ) from exc
    except httpx.HTTPError as exc:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            message=f"Pexels 搜索失败: {exc}",
        ) from exc

    if response.status_code >= 400:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            message=f"Pexels 搜索失败: status={response.status_code}",
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            message="Pexels 返回了无效响应",
        ) from exc

    photos = payload.get("photos") if isinstance(payload, dict) else []
    results: list[dict[str, Any]] = []
    for photo in photos if isinstance(photos, list) else []:
        if not isinstance(photo, dict):
            continue
        src = photo.get("src") if isinstance(photo.get("src"), dict) else {}
        thumbnail_url = str(src.get("medium") or src.get("large") or "").strip()
        full_url = str(src.get("large2x") or src.get("large") or src.get("original") or "").strip()
        if not thumbnail_url or not full_url:
            continue
        results.append(
            {
                "id": str(photo.get("id") or "").strip(),
                "thumbnail_url": thumbnail_url,
                "full_url": full_url,
                "photographer": str(photo.get("photographer") or "").strip(),
                "width": int(photo.get("width") or 0),
                "height": int(photo.get("height") or 0),
            }
        )
        if len(results) >= params["per_page"]:
            break
    return {"query": query_text, "results": results}
