# Component Architecture

## 组件分层

```
app/                        # 页面组件
components/                 # 业务组件
components/ui/              # 基础 UI 组件
```

## 核心组件设计

### 1. ChatInterface

**职责**: 对话交互的主容器

**Props**:
```typescript
interface ChatInterfaceProps {
  projectId: string;
  onMessageSend: (message: string) => void;
  onFileUpload: (files: File[]) => void;
}
```

**子组件**:
- `MessageList` - 消息列表
- `MessageInput` - 输入框
- `VoiceRecorder` - 语音录音
- `TypingIndicator` - 输入中指示器

### 2. MessageInput

**职责**: 用户输入（文字/语音）

**Props**:
```typescript
interface MessageInputProps {
  onSend: (message: string) => void;
  onVoiceStart: () => void;
  onVoiceEnd: (audioBlob: Blob) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**功能**:
- 文字输入（支持多行）
- 语音录音（实时关键词提取）
- 文件附件
- 快捷键支持（Enter 发送，Shift+Enter 换行）

### 3. FileUploadDropzone

**职责**: 文件上传与拖拽

**Props**:
```typescript
interface FileUploadDropzoneProps {
  projectId: string;
  onUploadComplete: (files: UploadedFile[]) => void;
  acceptedTypes?: string[];
  maxSize?: number; // 默认 100MB (104857600 bytes)
  multiple?: boolean;
}
```

**数据结构**:
```typescript
interface UploadedFile {
  id: string;
  filename: string;
  file_type: 'pdf' | 'word' | 'video' | 'image' | 'ppt';
  mime_type: string;
  file_size: number; // 字节，最大 104857600
  status: 'uploading' | 'parsing' | 'ready' | 'failed';
  parse_progress: number; // 0-100
  parse_details?: {
    pages_extracted?: number;
    images_extracted?: number;
    text_length?: number;
    duration?: number; // 视频时长（秒）
  };
  parse_error?: string;
  usage_intent?: string;
  created_at: string;
  updated_at: string;
}
```

**API 端点**: `/api/v1/files`

**功能**:
- 拖拽上传
- 点击选择
- 文件类型过滤（pdf, word, video, image, ppt）
- 上传进度显示
- 解析进度显示（parse_progress）
- 用途标注（usage_intent）
- 批量上传支持（`/api/v1/files/batch`）

### 4. VideoKeyframeSelector

**职责**: 视频关键帧选择与标注

**Props**:
```typescript
interface VideoKeyframeSelectorProps {
  videoId: string;
  keyframes: Keyframe[];
  onSelect: (selectedFrames: Keyframe[]) => void;
  onAnnotate: (frameId: string, annotation: string) => void;
}
```

**数据结构**:
```typescript
interface Keyframe {
  id: string;
  timestamp: number;
  thumbnailUrl: string;
  sceneType: string;
  selected: boolean;
  annotation?: string;
}
```

### 5. CoursewarePreview

**职责**: 课件预览与修改

**Props**:
```typescript
interface CoursewarePreviewProps {
  taskId: string;
  slides: Slide[];
  lessonPlan: LessonPlan;
  onModify: (instruction: string) => void;
  onExport: (format: 'ppt' | 'word') => void;
}
```

**数据结构**:
```typescript
interface GenerateOptions {
  template?: 'default' | 'gaia' | 'uncover' | 'academic';
  theme_color?: string; // 十六进制颜色代码，如 '#4A90E2'
  show_page_number?: boolean;
  header?: string;
  footer?: string;
  pages?: number; // 1-100
  include_animations?: boolean;
  include_games?: boolean;
  animation_format?: 'gif' | 'mp4' | 'html5';
}
```

**API 端点**:
- 创建生成任务: `/api/v1/generate/courseware`
- 下载文件: `/api/v1/generate/tasks/{task_id}/download?file_type=ppt|word`
- 查看版本历史: `/api/v1/generate/tasks/{task_id}/versions`

**子组件**:
- `SlideViewer` - 幻灯片查看器
- `SlideNavigator` - 导航器
- `ModifyChat` - 修改对话
- `LessonPlanView` - 教案视图
- `SourceBadge` - 溯源标记

### 6. LessonPlanView

**职责**: 教案同步显示与编辑

**Props**:
```typescript
interface LessonPlanViewProps {
  slideIndex: number;
  lessonPlan: LessonPlan;
  onEdit: (slideIndex: number, content: LessonPlanContent) => void;
  onSync: () => void;
}
```

**数据结构**:
```typescript
interface LessonPlanContent {
  slideIndex: number;
  objective: string;
  teacherScript: string;
  teachingTips: string[];
  duration: number;
  sources: Source[];
  studentActivities?: string[];
  notes?: string[];
}
```

### 7. ProgressTracker

**职责**: 任务进度跟踪与文件下载

**Props**:
```typescript
interface ProgressTrackerProps {
  className?: string;
  onDownload?: (taskId: string, fileType: "pptx" | "docx") => void;
}
```

**实现说明**:
- 内部使用 `generateStore` 获取当前生成任务状态
- 支持显示任务进度、状态、错误信息
- 当任务完成时显示 PPT/Word 下载按钮

**API 端点**: 
- 状态查询: `/api/v1/generate/tasks/{task_id}/status`
- 文件下载: `/api/v1/files/download/{task_id}/{fileType}`


## 数据结构与 OpenAPI 对齐

所有组件的数据结构严格遵循 OpenAPI schemas 定义，确保前后端数据一致性。

### 文件相关（参考 `docs/openapi/schemas/files.yaml`）

**UploadedFile**:
- `status`: `uploading | parsing | ready | failed`
- `file_type`: `pdf | word | video | image | ppt`
- `file_size`: 最大 104857600 bytes (100MB)
- `parse_progress`: 0-100
- `parse_details`: 包含 pages_extracted, images_extracted, text_length, duration

**API 端点**:
- 单文件上传: `POST /api/v1/files`
- 批量上传: `POST /api/v1/files/batch`
- 批量删除: `DELETE /api/v1/files/batch`
- 更新用途: `PATCH /api/v1/files/{file_id}/intent`

### 生成相关（参考 `docs/openapi/schemas/generate.yaml`）

**GenerateTask**:
- `status`: `pending | processing | completed | failed`
- `progress`: 0-100
- `result.version`: 版本号

**GenerateOptions**:
- `template`: `default | gaia | uncover | academic`
- `theme_color`: 十六进制颜色代码（如 `#4A90E2`）
- `pages`: 1-100
- `animation_format`: `gif | mp4 | html5`

**API 端点**:
- 创建任务: `POST /api/v1/generate/courseware`
- 查询状态: `GET /api/v1/generate/tasks/{task_id}/status`
- 下载文件: `GET /api/v1/generate/tasks/{task_id}/download?file_type=ppt|word`
- 版本历史: `GET /api/v1/generate/tasks/{task_id}/versions`

### 响应格式统一

所有 API 响应遵循统一格式：

**成功响应**:
```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}
```

**错误响应**:
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  message: string;
}
```

### 组件实现注意事项

1. **文件上传组件**必须使用 `/api/v1/files` 端点
2. **文件状态**必须使用 OpenAPI 定义的枚举值
3. **生成任务状态**必须使用 OpenAPI 定义的枚举值
4. **文件大小限制**为 100MB (104857600 bytes)
5. **所有 API 调用**必须正确处理统一响应格式
6. **生成的课件文件**通过 `/api/v1/generate/tasks/{task_id}/download` 下载，与原始参考文件隔离
