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
  maxSize?: number;
}
```

**功能**:
- 拖拽上传
- 点击选择
- 文件类型过滤
- 上传进度显示
- 用途标注

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
  onExport: (format: 'ppt' | 'word' | 'pdf') => void;
}
```

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

**职责**: 任务进度跟踪

**Props**:
```typescript
interface ProgressTrackerProps {
  tasks: Task[];
  onCancel?: (taskId: string) => void;
}
```

**数据结构**:
```typescript
interface Task {
  id: string;
  type: 'parse' | 'generate';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  errorMessage?: string;
}
```
