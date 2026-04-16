# Project Space Facade

`project_space_service/` 是 Spectra 对 `Ourograph` 的本地 facade。

它当前允许承担的事情：

- route/application 层可复用的请求整形
- 权限检查调用
- artifact 文件编排与 `Ourograph` formal record 绑定
- 响应 shape 兼容

它当前不应承担的事情：

- 第二套 `Project / Reference / Version / Artifact / CandidateChange / Member` 正式语义
- 独立于 `Ourograph` 的 formal-state 真相源
- backend-local project-space 产品主叙事

阅读建议：

- `service.py`：remote-only facade 主入口
- `artifacts.py`：本地 artifact 文件编排壳
- 其余语义 helper 视为迁移残留，后续应继续瘦身
