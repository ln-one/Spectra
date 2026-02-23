# State Management

## 状态管理方案

采用 **React Context + Zustand** 混合方案：

- **React Context**: 全局配置、主题、用户信息
- **Zustand**: 业务状态（项目、对话、上传）

## 状态结构

### 1. Project State

```typescript
// stores/projectStore.ts
interface ProjectState {
  // 数据
  currentProject: Project | null;
  projects: Project[];
  
  // 操作
  setCurrentProject: (project: Project) => void;
  createProject: (data: CreateProjectData) => Promise<Project>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
}

interface Project {
  id: string;
  name: string;
  description: string;
  subject: string;
  gradeLevel: string;
  duration: number;
  teachingObjectives: string[];
  status: 'draft' | 'generating' | 'completed';
  createdAt: string;
  updatedAt: string;
}
```

### 2. Chat State

```typescript
// stores/chatStore.ts
interface ChatState {
  // 数据
  messages: Message[];
  isTyping: boolean;
  
  // 操作
  addMessage: (message: Message) => void;
  sendMessage: (content: string) => Promise<void>;
  sendVoiceMessage: (audioBlob: Blob) => Promise<void>;
  clearMessages: () => void;
  setTyping: (isTyping: boolean) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    intent?: string;
    extractedInfo?: Record<string, any>;
    suggestions?: string[];
  };
  createdAt: string;
}
```

### 3. Upload State

```typescript
// stores/uploadStore.ts
interface UploadState {
  // 数据
  uploads: Upload[];
  uploadQueue: UploadTask[];
  
  // 操作
  addUpload: (file: File) => Promise<void>;
  updateUploadStatus: (id: string, status: UploadStatus) => void;
  annotateUpload: (id: string, annotation: string) => Promise<void>;
  deleteUpload: (id: string) => Promise<void>;
  fetchUploads: (projectId: string) => Promise<void>;
}

interface Upload {
  id: string;
  projectId: string;
  filename: string;
  filepath: string;
  fileType: string;
  mimeType: string;
  size: number;
  status: 'uploading' | 'parsing' | 'ready' | 'failed';
  parseResult?: ParseResult;
  usageIntent?: string;
  createdAt: string;
}
```

### 4. Generation State

```typescript
// stores/generationStore.ts
interface GenerationState {
  // 数据
  currentTask: GenerationTask | null;
  tasks: GenerationTask[];
  
  // 操作
  createTask: (data: CreateTaskData) => Promise<GenerationTask>;
  fetchTaskStatus: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  pollTaskStatus: (taskId: string) => void;
  stopPolling: () => void;
}

interface GenerationTask {
  id: string;
  projectId: string;
  taskType: 'ppt' | 'word' | 'both';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  inputData: Record<string, any>;
  outputUrls?: {
    ppt?: string;
    word?: string;
  };
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}
```

## Store 使用示例

```typescript
// 在组件中使用
import { useProjectStore } from '@/stores/projectStore';
import { useChatStore } from '@/stores/chatStore';

function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { currentProject, setCurrentProject } = useProjectStore();
  const { messages, sendMessage } = useChatStore();
  
  useEffect(() => {
    fetchProject(params.id).then(setCurrentProject);
  }, [params.id]);
  
  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };
  
  return (
    <ChatInterface
      projectId={params.id}
      messages={messages}
      onSend={handleSendMessage}
    />
  );
}
```
