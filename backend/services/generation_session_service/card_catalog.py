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
        id="courseware_ppt",
        title="璇句欢鐢熸垚",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.HYBRID,
        execution_mode=StudioCardExecutionMode.COMPOSITE,
        primary_capabilities=["ppt", "outline"],
        related_capabilities=["word", "summary"],
        artifact_types=["pptx", "summary"],
        session_output_type=SessionOutputType.PPT.value,
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="template",
                label="璇句欢妯℃澘",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="default", label="榛樿妯℃澘"),
                    StudioCardConfigOption(value="gaia", label="GAIA"),
                    StudioCardConfigOption(value="uncover", label="UNCOVER"),
                ],
                default_value="default",
            ),
            StudioCardConfigField(
                key="pages",
                label="椤垫暟",
                type=StudioCardFieldType.INTEGER,
                default_value=12,
            ),
            StudioCardConfigField(
                key="audience",
                label="鍙椾紬灞傜骇",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="primary", label="灏忓"),
                    StudioCardConfigOption(value="middle", label="鍒濅腑"),
                    StudioCardConfigOption(value="high", label="楂樹腑"),
                    StudioCardConfigOption(value="intermediate", label="澶у"),
                ],
                default_value="intermediate",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚璇句欢"),
            StudioCardAction(type="chat_refine", label="鍦ㄨ浠朵笂涓嬫枃涓户缁井璋?"),
        ],
        notes="璇句欢鍗＄墖宸叉帴鍏?session 涓婚摼锛屽彲鐩存帴澶嶇敤 outline->generate->artifact->download 闂幆銆?",
    ),
    StudioCardCapability(
        id="word_document",
        title="Word 鏁欐涓庢枃妗?",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.HYBRID,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["word", "handout"],
        related_capabilities=["outline", "summary", "quiz"],
        artifact_types=["docx", "summary", "exercise"],
        requires_source_artifact=True,
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="source_artifact_id",
                label="瀵瑰簲 PPT",
                type=StudioCardFieldType.REFERENCE,
                required=True,
                notes="蹇呴』缁戝畾涓€涓凡鐢熸垚鐨?PPT artifact銆?",
            ),
            StudioCardConfigField(
                key="document_variant",
                label="鏂囨。绫诲瀷",
                type=StudioCardFieldType.SELECT,
                required=True,
                options=[
                    StudioCardConfigOption(
                        value="layered_lesson_plan", label="鍒嗗眰鏁欐"
                    ),
                    StudioCardConfigOption(value="student_handout", label="瀛︾敓璁蹭箟"),
                    StudioCardConfigOption(value="post_class_quiz", label="璇惧悗娴嬭瘯棰?"),
                    StudioCardConfigOption(value="lab_guide", label="瀹為獙鎸囧涔?"),
                ],
                default_value="layered_lesson_plan",
            ),
            StudioCardConfigField(
                key="teaching_model",
                label="鏁欏妯″瀷",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="inquiry", label="鎺㈢┒寮?"),
                    StudioCardConfigOption(value="scaffolded", label="鑴氭墜鏋跺紡"),
                    StudioCardConfigOption(value="project_based", label="椤圭洰寮?"),
                ],
            ),
            StudioCardConfigField(
                key="grade_band",
                label="閫傜敤骞寸骇",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="primary", label="灏忓"),
                    StudioCardConfigOption(value="middle", label="鍒濅腑"),
                    StudioCardConfigOption(value="high", label="楂樹腑"),
                    StudioCardConfigOption(value="college", label="澶у"),
                ],
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚鏂囨。"),
            StudioCardAction(type="chat_refine", label="鍦ㄦ枃妗ｄ笂涓嬫枃涓眬閮ㄦ敼鍐?"),
        ],
        notes="鏂囨。鐢熸垚涓庤涔夋壙杞藉凡鍏峰锛屽崱鐗囩骇閰嶇疆鍗忚浠嶅緟琛ラ綈銆?",
    ),
    StudioCardCapability(
        id="interactive_quick_quiz",
        title="闅忓爞灏忔祴",
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
                label="棰橀噺",
                type=StudioCardFieldType.INTEGER,
                required=True,
                default_value=5,
            ),
            StudioCardConfigField(
                key="difficulty",
                label="闅惧害",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="easy", label="鍩虹"),
                    StudioCardConfigOption(value="medium", label="杩涢樁"),
                    StudioCardConfigOption(value="hard", label="鎸戞垬"),
                ],
                default_value="medium",
            ),
            StudioCardConfigField(
                key="humorous_distractors",
                label="骞介粯骞叉壈椤?",
                type=StudioCardFieldType.BOOLEAN,
                default_value=False,
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚棰樼洰"),
            StudioCardAction(type="chat_refine", label="鎸夊綋鍓嶉鐩笂涓嬫枃閲嶅啓"),
        ],
        notes="棰樼洰 artifact 宸插叿澶囷紝鍗曢娌夋蹈寮忎氦浜掍笌灞€閮ㄩ噸缁樺崗璁粛寰呰ˉ榻愩€?",
    ),
    StudioCardCapability(
        id="interactive_games",
        title="浜掑姩娓告垙",
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
                label="娓告垙妯″紡",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="timeline_sort", label="鏃堕棿杞存帓搴?"),
                    StudioCardConfigOption(value="concept_match", label="姒傚康杩炵嚎"),
                    StudioCardConfigOption(value="freeform", label="鑷敱鍙戞尌"),
                ],
                default_value="freeform",
            ),
            StudioCardConfigField(
                key="creative_brief",
                label="鐏垫劅鎻愮ず",
                type=StudioCardFieldType.TEXT,
                placeholder="渚嬪锛氬洿缁曠墰椤夸笁瀹氬緥璁捐涓€涓嫋鎷芥帓搴忓皬娓告垙",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚娓告垙鍘熷瀷"),
            StudioCardAction(type="chat_refine", label="鍦ㄦ父鎴忎笂涓嬫枃涓儹鏇存柊瑙勫垯"),
        ],
        notes=(
            "HTML artifact 涓?sandbox patch 鐑洿鏂板凡鍏峰锛?"
            "refine 缁撴灉閫氳繃 replacement artifact 鏀跺彛銆?"
        ),
    ),
    StudioCardCapability(
        id="knowledge_mindmap",
        title="鎬濈淮瀵煎浘",
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
                label="鑱氱劍鑼冨洿",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="full_project", label="鏁翠釜椤圭洰"),
                    StudioCardConfigOption(value="current_session", label="褰撳墠浼氳瘽"),
                ],
                default_value="full_project",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚瀵煎浘"),
            StudioCardAction(type="chat_refine", label="鎸夐€変腑鑺傜偣鎵╁睍鍒嗘敮"),
        ],
        notes="瀵煎浘 artifact 涓庤妭鐐圭骇 refine 宸插叿澶囷紝鑺傜偣鎵╁睍閫氳繃 replacement artifact 鏀跺彛銆?",
    ),
    StudioCardCapability(
        id="demonstration_animations",
        title="婕旂ず鍔ㄧ敾",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        execution_mode=StudioCardExecutionMode.ARTIFACT_CREATE,
        primary_capabilities=["animation"],
        related_capabilities=["summary", "ppt"],
        artifact_types=["gif", "mp4"],
        supports_chat_refine=True,
        config_fields=[
            StudioCardConfigField(
                key="topic",
                label="鍔ㄧ敾涓婚",
                type=StudioCardFieldType.TEXT,
                required=True,
                placeholder="渚嬪锛氬厜鍚堜綔鐢ㄧ數瀛愪紶閫掓祦绋?",
            ),
            StudioCardConfigField(
                key="motion_brief",
                label="琛ㄧ幇閲嶇偣",
                type=StudioCardFieldType.TEXT,
                placeholder="渚嬪锛氱獊鍑哄叧閿楠ゅ垏鎹笌鍥犳灉鍏崇郴",
            ),
            StudioCardConfigField(
                key="duration_seconds",
                label="鏃堕暱(绉?",
                type=StudioCardFieldType.INTEGER,
                default_value=6,
            ),
            StudioCardConfigField(
                key="rhythm",
                label="鑺傚",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(value="slow", label="鎱㈤€熻瑙?"),
                    StudioCardConfigOption(value="balanced", label="鍧囪　"),
                    StudioCardConfigOption(value="fast", label="蹇€熸紨绀?"),
                ],
                default_value="balanced",
            ),
            StudioCardConfigField(
                key="style_pack",
                label="\u89c6\u89c9\u4e3b\u9898",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(
                        value="teaching_ppt_cartoon",
                        label="\u5361\u901a\u8bfe\u5802",
                        description="\u9ad8\u5bf9\u6bd4\u8272\u5757\u4e0e\u5706\u89d2\u98ce\u683c\uff0c\u9002\u5408\u4f4e\u9f84\u79d1\u666e\u4e3b\u9898\u3002",
                    ),
                    StudioCardConfigOption(
                        value="teaching_ppt_fresh_green",
                        label="\u6e05\u65b0\u7eff\u610f",
                        description="\u6d45\u7eff\u4e0e\u767d\u5e95\u7684\u6e05\u723d\u98ce\u683c\uff0c\u9002\u5408\u81ea\u7136\u79d1\u5b66\u548c\u8fc7\u7a0b\u8bb2\u89e3\u3002",
                    ),
                    StudioCardConfigOption(
                        value="teaching_ppt_deep_blue",
                        label="\u79d1\u6280\u6df1\u84dd",
                        description="\u84dd\u7070\u79d1\u6280\u98ce\u683c\uff0c\u9002\u5408\u7f51\u7edc\u3001\u5de5\u7a0b\u4e0e\u7cfb\u7edf\u7c7b\u4e3b\u9898\u3002",
                    ),
                    StudioCardConfigOption(
                        value="teaching_ppt_warm_orange",
                        label="\u6696\u9633\u6a59\u8c03",
                        description="\u6696\u8272\u53d9\u4e8b\u98ce\u683c\uff0c\u9002\u5408\u6545\u4e8b\u5316\u8bb2\u89e3\u4e0e\u6982\u5ff5\u5bfc\u5165\u3002",
                    ),
                    StudioCardConfigOption(
                        value="teaching_ppt_minimal_gray",
                        label="\u6781\u7b80\u7070\u9636",
                        description="\u4e2d\u6027\u7070\u6781\u7b80\u98ce\u683c\uff0c\u9002\u5408\u7ed3\u6784\u5316\u63a8\u5bfc\u4e0e\u91cd\u70b9\u7a81\u51fa\u3002",
                    ),
                ],
                default_value="teaching_ppt_cartoon",
            ),
            StudioCardConfigField(
                key="render_mode",
                label="娓叉煋妯″紡",
                type=StudioCardFieldType.SELECT,
                options=[
                    StudioCardConfigOption(
                        value="gif",
                        label="楂樿川閲忔暀瀛﹀姩鐢伙紙Manim锛?",
                        description="LLM 鎸変富棰樺畾鍒?Manim 浠ｇ爜娓叉煋锛屾棤妯℃澘鍖栵紝鏁堟灉鏇磋创棰樸€?",
                    ),
                    StudioCardConfigOption(
                        value="cloud_video_wan",
                        label="浜戠瑙嗛澧炲己",
                        description="璋冪敤闃块噷鐧剧偧 Wan 杈撳嚭 MP4锛岄€傚悎琛ㄧ幇鍨嬩富棰樸€?",
                    ),
                ],
                default_value="gif",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚鍔ㄧ敾"),
            StudioCardAction(type="chat_refine", label="璋冩暣鏃堕暱 / 鑺傚 / 閲嶇偣"),
        ],
        notes="榛樿浠嶈緭鍑?GIF 鐙珛 artifact锛涘惎鐢ㄤ簯绔棰戝寮烘椂浼氱敓鎴?MP4锛屼紭鍏堟湇鍔¤〃鐜板瀷涓婚锛屼笉鐩存帴鏇夸唬鐜版湁 GIF/PPT 鎻掑叆涓婚摼銆?",
    ),
    StudioCardCapability(
        id="speaker_notes",
        title="璇磋鍔╂墜",
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
                label="PPT 鎴愭灉",
                type=StudioCardFieldType.REFERENCE,
                required=True,
                notes="闇€缁戝畾涓€涓凡鐢熸垚鐨?PPT artifact銆?",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鐢熸垚璇磋绋?"),
            StudioCardAction(type="chat_refine", label="鎸夐€変腑娈佃惤鏀瑰啓杩囨浮璇?"),
        ],
        notes="source-artifact 缁戝畾銆侀€愰〉璁茬鐢熸垚涓庢钀界骇 refine 宸插叿澶囷紝浜х墿姝ｅ紡鏀跺彛涓?summary artifact銆?",
    ),
    StudioCardCapability(
        id="classroom_qa_simulator",
        title="瀛︽儏棰勬紨",
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
                label="瀛︾敓鐢诲儚",
                type=StudioCardFieldType.MULTISELECT,
                options=[
                    StudioCardConfigOption(
                        value="strong_divergent", label="鍙戞暎鎬濈淮鐨勫ソ瀛︾敓"
                    ),
                    StudioCardConfigOption(
                        value="confused_foundation", label="瀹规槗鎼炴贩姒傚康鐨勫鐢?"
                    ),
                    StudioCardConfigOption(
                        value="formula_driven", label="鎵х潃鍏紡鎺ㄥ鐨勫鐢?"
                    ),
                ],
            ),
            StudioCardConfigField(
                key="question_focus",
                label="鎻愰棶鐒︾偣",
                type=StudioCardFieldType.TEXT,
                placeholder="渚嬪锛氬簳灞傚叕寮忔帹瀵笺€佸父瑙佹槗閿欑偣",
            ),
        ],
        actions=[
            StudioCardAction(type="generate", label="鍚姩棰勬紨"),
            StudioCardAction(type="chat_refine", label="璋冩暣铏氭嫙瀛︾敓鎻愰棶椋庢牸"),
        ],
        notes="棰勬紨鑴氭湰鍘熷瀷涓庡垵濮嬫墽琛屽凡鍏峰锛岃櫄鎷熷鐢熷崗璁笌璇勪及鍥炶矾浠嶅緟琛ラ綈銆?",
    ),
)



