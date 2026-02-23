# API Integration

## API 客户端封装

> REVIEW-P0(blocking) 问题：此处文档定义为 `Axios`，当前实现 `frontend/lib/api.ts` 使用 Fetch Wrapper。  
> REVIEW-P0(blocking) 建议：**统一为 Fetch Wrapper 方案**（改动最小）
> 理由：
> - `frontend/lib/api.ts` 已有完整的 Fetch 封装实现
> - `package.json` 当前无 axios 依赖，无需新增外部库
> - 改动最小—仅需更新文档示例，明确不混用
> - 核心目标：**文档与代码一致**
>


> REVIEW-P0(blocking) 问题：当前 `frontend/lib/api.ts` 已超过 300 行，需要拆分。  
> REVIEW-P0(blocking) 建议：按 Index Pattern 拆分为 `lib/api/{types.ts, request.ts, response.ts, methods.ts}` + `index.ts` 入口

```typescript
// lib/api.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || '请求失败';
    toast.error(message);
    return Promise.reject(error);
  }
);

export default apiClient;
```

> REVIEW-P0(blocking) 问题：文档示例直接读取 `localStorage.getItem('token')`，与实现中 `access_token` 约定不一致。  
> REVIEW-P0(blocking) 建议：文档示例改为 `TokenStorage.getAccessToken()`，并统一约定键名为 `access_token`，避免后续扩展时出现隐性认证故障。

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
