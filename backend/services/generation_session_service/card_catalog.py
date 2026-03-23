from __future__ import annotations

from schemas.studio_cards import (
    StudioCardAction,
    StudioCardCapability,
    StudioCardConfigField,
    StudioCardConfigOption,
    StudioCardContextMode,
    StudioCardExecutionMode,
    StudioCardFieldType,
    StudioCardReadiness,
)
from services.generation_session_service.constants import SessionOutputType

CARD_CAPABILITIES: tuple[StudioCardCapability, ...] = (
    StudioCardCapability(
        id="word_document",
        title="Word 教案与文档",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.HYBRID,
        execution_mode=StudioCardExecutionMode.COMPOSITE,
        primary_capabilities=["word", "handout"],
        related_capabilities=["outline", "summary", "quiz"],
        artifact_types=["docx", "summary", "exercise"],
        session_output_type=SessionOutputType.WORD.value,
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="document_variant",
                label="文档类型",
                type=StudioCardFieldType.SELECT,
                required=True,
                options=[
                    StudioCardConfigOption(
                        value="layered_lesson_plan", label="分层教案"
                    ),
                    StudioCardConfigOption(value="student_handout", label="学生讲义"),
                    StudioCardConfigOption(value="post_class_quiz", label="课后测试题"),
                    StudioCardConfigOption(value="lab_guide", label="实验指导书"),
                ],
                default_value="layered_lesson_plan",
            ),
            StudioCardConfigField(
                key="teaching_model",
                label="教学模型",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="inquiry", label="探究式"),
                    StudioCardConfigOption(value="scaffolded", label="脚手架式"),
                    StudioCardConfigOption(value="project_based", label="项目式"),
                ],
            ),
            StudioCardConfigField(
                key="grade_band",
                label="适用年级",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="primary", label="小学"),
                    StudioCardConfigOption(value="middle", label="初中"),
                    StudioCardConfigOption(value="high", label="高中"),
                    StudioCardConfigOption(value="college", label="大学"),
                ],
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="生成文档"),
            StudioCardAction(type="chat_refine", label="在文档上下文中局部改写"),
        ],
        notes="文档生成与讲义承载已具备，卡片级配置协议仍待补齐。",
    ),
    StudioCardCapability(
        id="interactive_quick_quiz",
        title="随堂小测",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["quiz"],
        related_capabilities=["summary", "outline"],
        artifact_types=["exercise"],
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="question_count",
                label="题量",
                type=StudioCardFieldType.INTEGER,
                required=True,
                default_value=5,
            ),
            StudioCardConfigField(
                key="difficulty",
                label="难度",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="easy", label="基础"),
                    StudioCardConfigOption(value="medium", label="进阶"),
                    StudioCardConfigOption(value="hard", label="挑战"),
                ],
                default_value="medium",
            ),
            StudioCardConfigField(
                key="humorous_distractors",
                label="幽默干扰项",
                type=StudioCardFieldType.BOOLEAN,
                default_value=False,
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="生成题目"),
            StudioCardAction(type="chat_refine", label="按当前题目上下文重写"),
        ],
        notes="题目 artifact 已具备，单题沉浸式交互与局部重绘协议仍待补齐。",
    ),
    StudioCardCapability(
        id="interactive_games",
        title="互动游戏",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["game", "html"],
        related_capabilities=["summary", "mindmap"],
        artifact_types=["html"],
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="game_pattern",
                label="游戏模式",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="timeline_sort", label="时间轴排序"),
                    StudioCardConfigOption(value="concept_match", label="概念连线"),
                    StudioCardConfigOption(value="freeform", label="自由发挥"),
                ],
                default_value="freeform",
            ),
            StudioCardConfigField(
                key="creative_brief",
                label="灵感提示",
                type=StudioCardFieldType.TEXT,
                placeholder="例如：围绕牛顿三定律设计一个拖拽排序小游戏",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="生成游戏原型"),
            StudioCardAction(type="chat_refine", label="在游戏上下文中热更新规则"),
        ],
        notes=(
            "HTML artifact 与 sandbox patch 热更新已具备，"
            "refine 结果通过 replacement artifact 收口。"
        ),
    ),
    StudioCardCapability(
        id="knowledge_mindmap",
        title="思维导图",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["mindmap"],
        related_capabilities=["summary", "outline"],
        artifact_types=["mindmap"],
        supports_chat_refine=True,
        supports_selection_context=True,
        config_fields=[
            StudioCardConfigField(
                key="focus_scope",
                label="聚焦范围",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="full_project", label="整个项目"),
                    StudioCardConfigOption(value="current_session", label="当前会话"),
                ],
                default_value="full_project",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="生成导图"),
            StudioCardAction(type="chat_refine", label="按选中节点扩展分支"),
        ],
        notes="导图 artifact 与节点级 refine 已具备，节点扩展通过 replacement artifact 收口。",
    ),
    StudioCardCapability(
        id="demonstration_animations",
        title="演示动画",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["animation"],
        related_capabilities=["summary", "outline"],
        artifact_types=["html", "gif", "mp4"],
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="animation_format",
                label="动画格式",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="gif", label="GIF"),
                    StudioCardConfigOption(value="mp4", label="MP4"),
                    StudioCardConfigOption(value="html5", label="HTML5"),
                ],
                default_value="html5",
            ),
            StudioCardConfigField(
                key="motion_brief",
                label="动画描述",
                type=StudioCardFieldType.TEXT,
                placeholder="例如：把冒泡排序过程渲染成逐帧交换动画",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="生成动画"),
            StudioCardAction(type="chat_refine", label="热更新动画参数"),
        ],
        notes="动画统一以 storyboard 为源内容，现已正式支持 HTML5、GIF 与 MP4 输出。",
    ),
    StudioCardCapability(
        id="speaker_notes",
        title="说课助手",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.HYBRID,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["speaker_notes", "summary"],
        related_capabilities=["word", "summary"],
        artifact_types=["summary"],
        requires_source_artifact=True,
        supports_chat_refine=True,
        supports_selection_context=True,
        config_fields=[
            StudioCardConfigField(
                key="source_artifact_id",
                label="PPT 成果",
                type=StudioCardFieldType.REFERENCE,
                required=True,
                notes="需绑定一个已生成的 PPT artifact。",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="生成说课稿"),
            StudioCardAction(type="chat_refine", label="按选中段落改写过渡语"),
        ],
        notes="source-artifact 绑定、逐页讲稿生成与段落级 refine 已具备，产物正式收口为 summary artifact。",
    ),
    StudioCardCapability(
        id="classroom_qa_simulator",
        title="学情预演",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.HYBRID,
        execution_mode=StudioCardExecutionMode.COMPOSITE,
        primary_capabilities=["qa_simulator", "chat"],
        related_capabilities=["rag", "summary", "outline"],
        artifact_types=["summary"],
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="student_profiles",
                label="学生画像",
                type=StudioCardFieldType.MULTISELECT,
                options=[
                    StudioCardConfigOption(
                        value="strong_divergent", label="发散思维的好学生"
                    ),
                    StudioCardConfigOption(
                        value="confused_foundation", label="容易搞混概念的学生"
                    ),
                    StudioCardConfigOption(
                        value="formula_driven", label="执着公式推导的学生"
                    ),
                ],
            ),
            StudioCardConfigField(
                key="question_focus",
                label="提问焦点",
                type=StudioCardFieldType.TEXT,
                placeholder="例如：底层公式推导、常见易错点",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="启动预演"),
            StudioCardAction(type="chat_refine", label="调整虚拟学生提问风格"),
        ],
        notes="预演脚本原型与初始执行已具备，虚拟学生协议与评估回路仍待补齐。",
    ),
)
