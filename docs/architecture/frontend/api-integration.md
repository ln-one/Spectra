# API Integration

## API 客户端封装

### 技术方案

本项目使用 **Fetch API** 进行 HTTP 请求，而不是 Axios。

选择理由：
- 原生浏览器 API，无需额外依赖
- 现代浏览器全面支持
- 与 Next.js 生态更好集成
- 代码体积更小

### 基础客户端实现

```typescript
// lib/api/client.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = TokenStorage.getAccessToken();
  
  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '请求失败');
  }
  
  return response.json();
}
```

## API 服务层

> REVIEW-P1(important) 问题：文档中示例路径为 `lib/services/projectService.ts`，但当前仓库中 `lib/services/` 目录不存在。
> REVIEW-P1(important) 建议：确认是否需要创建 `lib/services/` 目录，并将服务层拆分；或调整文档路径到实际结构。

### Project Service

```typescript
// lib/services/projectService.ts
export const projectService = {
  async getProjects(): Promise<Project[]> {
    return apiClient.get('/projects');
  },
  
  async getProject(id: string): Promise<Project> {
    return apiClient.get(`/projects/${id}`);
  },
  
  async createProject(data: CreateProjectData): Promise<Project> {
    return apiClient.post('/projects', data);
  },
  
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    return apiClient.patch(`/projects/${id}`, data);
  },
  
  async deleteProject(id: string): Promise<void> {
    return apiClient.delete(`/projects/${id}`);
  },
};
```

### Chat Service

```typescript
// lib/services/chatService.ts
export const chatService = {
  async sendMessage(projectId: string, content: string): Promise<Message> {
    return apiClient.post('/chat/messages', {
      project_id: projectId,
      content,
    });
  },
  
  async getMessages(projectId: string): Promise<Message[]> {
    return apiClient.get(`/chat/messages?project_id=${projectId}`);
  },
  
  async transcribeAudio(audioBlob: Blob): Promise<{ text: string }> {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    return apiClient.post('/chat/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
```

### Upload Service

```typescript
// lib/services/uploadService.ts
export const uploadService = {
  async uploadFile(
    projectId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<Upload> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    
    return apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress?.(progress);
        }
      },
    });
  },
  
  async annotateUpload(fileId: string, intent: string): Promise<void> {
    return apiClient.patch(`/upload/${fileId}/intent`, { intent });
  },
  
  async getUploads(projectId: string): Promise<Upload[]> {
    return apiClient.get(`/upload/${projectId}`);
  },
};
```

### Generation Service

```typescript
// lib/services/generationService.ts
export const generationService = {
  async createTask(data: CreateTaskData): Promise<GenerationTask> {
    return apiClient.post('/generate/courseware', data);
  },
  
  async getTaskStatus(taskId: string): Promise<GenerationTask> {
    return apiClient.get(`/generate/status/${taskId}`);
  },
  
  async getPreview(taskId: string): Promise<PreviewData> {
    return apiClient.get(`/preview/${taskId}`);
  },
  
  async modifyPreview(taskId: string, instruction: string): Promise<void> {
    return apiClient.post(`/preview/${taskId}/modify`, { instruction });
  },
};
```

## 轮询机制

```typescript
// hooks/useTaskPolling.ts
import { useEffect, useRef } from 'react';

export function useTaskPolling(
  taskId: string | null,
  onUpdate: (task: GenerationTask) => void,
  interval = 2000
) {
  const timerRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (!taskId) return;
    
    const poll = async () => {
      try {
        const task = await generationService.getTaskStatus(taskId);
        onUpdate(task);
        
        if (task.status === 'completed' || task.status === 'failed') {
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };
    
    poll();
    timerRef.current = setInterval(poll, interval);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [taskId, interval, onUpdate]);
}
```
