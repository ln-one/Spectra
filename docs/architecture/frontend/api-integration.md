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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message: string;
  error?: {
    code: string;
    message: string;
  };
}

export async function request<T>(
  endpoint: string,
  options: RequestInit & { requireAuth?: boolean } = {}
): Promise<T> {
  const { requireAuth = true, ...fetchOptions } = options;
  const token = TokenStorage.getAccessToken();
  
  const config: RequestInit = {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(requireAuth && token && { Authorization: `Bearer ${token}` }),
      ...fetchOptions.headers,
    },
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  const result: ApiResponse<T> = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || result.message || '请求失败');
  }
  
  return result.data as T;
}
```

## Token 存储管理

```typescript
// lib/api/token-storage.ts
export class TokenStorage {
  private static ACCESS_TOKEN_KEY = 'access_token';
  private static REFRESH_TOKEN_KEY = 'refresh_token';
  
  static getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }
  
  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }
  
  static setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }
  
  static clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }
}
```

## API 服务层

### Auth Service

```typescript
// lib/api/auth.ts
interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  fullName?: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserInfo;
}

interface UserInfo {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  createdAt: string;
}

export const authApi = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },
  
  async login(data: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },
  
  async refresh(refreshToken: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      requireAuth: false,
    });
  },
  
  async logout(): Promise<void> {
    await request<void>('/auth/logout', {
      method: 'POST',
    });
    // 清空本地 token
    TokenStorage.clearTokens();
  },
  
  async getCurrentUser(): Promise<UserInfo> {
    const response = await request<{ user: UserInfo }>('/auth/me', {
      method: 'GET',
    });
    return response.user;
  },
};
```

### Project Service

```typescript
// lib/api/projects.ts
interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

interface CreateProjectData {
  name: string;
  description?: string;
}

export const projectApi = {
  async getProjects(): Promise<Project[]> {
    const response = await request<{ projects: Project[] }>('/projects', {
      method: 'GET',
    });
    return response.projects;
  },
  
  async getProject(id: string): Promise<Project> {
    const response = await request<{ project: Project }>(`/projects/${id}`, {
      method: 'GET',
    });
    return response.project;
  },
  
  async createProject(data: CreateProjectData): Promise<Project> {
    const response = await request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.project;
  },
  
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const response = await request<{ project: Project }>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return response.project;
  },
  
  async deleteProject(id: string): Promise<void> {
    await request<void>(`/projects/${id}`, {
      method: 'DELETE',
    });
  },
  
  async getProjectStatistics(id: string): Promise<ProjectStatistics> {
    const response = await request<{ statistics: ProjectStatistics }>(
      `/projects/${id}/statistics`,
      { method: 'GET' }
    );
    return response.statistics;
  },
  
  async searchProjects(query: string): Promise<Project[]> {
    const response = await request<{ projects: Project[] }>(
      `/projects/search?q=${encodeURIComponent(query)}`,
      { method: 'GET' }
    );
    return response.projects;
  },
};

interface ProjectStatistics {
  total_files: number;
  total_messages: number;
  total_tasks: number;
  completed_tasks: number;
}
```

### Files Service

```typescript
// lib/api/files.ts
interface UploadedFile {
  id: string;
  filename: string;
  file_type: 'pdf' | 'word' | 'video' | 'image' | 'ppt';
  mime_type: string;
  file_size: number; // 字节，最大 104857600 (100MB)
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

interface BatchUploadResponse {
  files: UploadedFile[];
  total: number;
  failed: Array<{
    filename: string;
    error: string;
  }>;
}

interface BatchDeleteResponse {
  deleted: number;
  failed: Array<{
    file_id: string;
    error: string;
  }>;
}

export const filesApi = {
  async uploadFile(projectId: string, file: File): Promise<UploadedFile> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', projectId);
    
    const response = await request<{ file: UploadedFile }>('/files', {
      method: 'POST',
      body: formData,
      headers: {}, // 让浏览器自动设置 Content-Type
    });
    return response.file;
  },
  
  async batchUpload(projectId: string, files: File[]): Promise<BatchUploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('project_id', projectId);
    
    return request<BatchUploadResponse>('/files/batch', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },
  
  async deleteFile(fileId: string): Promise<void> {
    await request<void>(`/files/${fileId}`, {
      method: 'DELETE',
    });
  },
  
  async batchDelete(fileIds: string[]): Promise<BatchDeleteResponse> {
    return request<BatchDeleteResponse>('/files/batch', {
      method: 'DELETE',
      body: JSON.stringify({ file_ids: fileIds }),
    });
  },
  
  async updateIntent(fileId: string, intent: string): Promise<UploadedFile> {
    const response = await request<{ file: UploadedFile }>(`/files/${fileId}/intent`, {
      method: 'PATCH',
      body: JSON.stringify({ usage_intent: intent }),
    });
    return response.file;
  },
};
```

### Chat Service

```typescript
// lib/api/chat.ts
interface Message {
  id: string;
  project_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SendMessageRequest {
  project_id: string;
  content: string;
}

export const chatApi = {
  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const response = await request<{ message: Message }>('/chat/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.message;
  },
  
  async getMessages(projectId: string): Promise<Message[]> {
    const response = await request<{ messages: Message[] }>(
      `/chat/messages?project_id=${projectId}`,
      { method: 'GET' }
    );
    return response.messages;
  },
  
  async transcribeAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    
    const response = await request<{ text: string }>('/chat/transcribe', {
      method: 'POST',
      body: formData,
      headers: {},
    });
    return response.text;
  },
};
```

### Generation Service

```typescript
// lib/api/generate.ts
interface GenerateRequest {
  project_id: string;
  type: 'ppt' | 'word' | 'both';
  options?: {
    template?: 'default' | 'gaia' | 'uncover' | 'academic';
    theme_color?: string; // 十六进制颜色代码，如 '#4A90E2'
    show_page_number?: boolean;
    header?: string;
    footer?: string;
    pages?: number; // 1-100
    include_animations?: boolean;
    include_games?: boolean;
    animation_format?: 'gif' | 'mp4' | 'html5';
  };
}

interface GenerateResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface GenerateStatusResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  result?: {
    ppt_url?: string;
    word_url?: string;
    version?: number;
  };
  error?: string;
}

interface VersionInfo {
  version: number;
  created_at: string;
  status: 'completed' | 'failed';
  file_urls?: {
    ppt_url?: string;
    word_url?: string;
  };
  modification_note?: string;
}

interface VersionsResponse {
  task_id: string;
  versions: VersionInfo[];
}

export const generateApi = {
  async createTask(data: GenerateRequest): Promise<GenerateResponse> {
    return request<GenerateResponse>('/generate/courseware', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async getTaskStatus(taskId: string): Promise<GenerateStatusResponse> {
    return request<GenerateStatusResponse>(`/generate/tasks/${taskId}/status`, {
      method: 'GET',
    });
  },
  
  async downloadFile(taskId: string, fileType: 'ppt' | 'word'): Promise<Blob> {
    const token = TokenStorage.getAccessToken();
    const response = await fetch(
      `${API_BASE_URL}/generate/tasks/${taskId}/download?file_type=${fileType}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error('文件下载失败');
    }
    
    return response.blob();
  },
  
  async getVersions(taskId: string): Promise<VersionsResponse> {
    return request<VersionsResponse>(`/generate/tasks/${taskId}/versions`, {
      method: 'GET',
    });
  },
};
```

## 轮询机制

```typescript
// hooks/useTaskPolling.ts
import { useEffect, useRef } from 'react';
import { generateApi } from '@/lib/api/generate';
import type { GenerateStatusResponse } from '@/lib/api/generate';

export function useTaskPolling(
  taskId: string | null,
  onUpdate: (task: GenerateStatusResponse) => void,
  interval = 2000
) {
  const timerRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (!taskId) return;
    
    const poll = async () => {
      try {
        const task = await generateApi.getTaskStatus(taskId);
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

## Token 刷新机制

```typescript
// lib/api/token-refresh.ts
import { authApi } from './auth';
import { TokenStorage } from './token-storage';

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
}

export async function refreshAccessToken(): Promise<string> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      subscribeTokenRefresh((token: string) => {
        resolve(token);
      });
    });
  }

  isRefreshing = true;

  try {
    const refreshToken = TokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await authApi.refresh(refreshToken);
    TokenStorage.setTokens(response.access_token, response.refresh_token);
    
    onTokenRefreshed(response.access_token);
    return response.access_token;
  } catch (error) {
    TokenStorage.clearTokens();
    window.location.href = '/auth/login';
    throw error;
  } finally {
    isRefreshing = false;
  }
}

// 在 request 函数中集成自动刷新
export async function requestWithRefresh<T>(
  endpoint: string,
  options: RequestInit & { requireAuth?: boolean } = {}
): Promise<T> {
  try {
    return await request<T>(endpoint, options);
  } catch (error) {
    if (error instanceof Error && error.message.includes('401')) {
      // Token 过期，尝试刷新
      const newToken = await refreshAccessToken();
      
      // 使用新 token 重试请求
      const { requireAuth = true, ...fetchOptions } = options;
      const config: RequestInit = {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...(requireAuth && { Authorization: `Bearer ${newToken}` }),
          ...fetchOptions.headers,
        },
      };
      
      return request<T>(endpoint, config);
    }
    throw error;
  }
}
```

## 使用示例

### 完整的认证流程

```typescript
// 注册
const registerData = {
  email: 'user@example.com',
  password: 'SecurePass123',
  username: 'john_doe',
  fullName: 'John Doe', // 可选
};

const authResponse = await authApi.register(registerData);
TokenStorage.setTokens(authResponse.access_token, authResponse.refresh_token);

// 登录
const loginData = {
  email: 'user@example.com',
  password: 'SecurePass123',
};

const loginResponse = await authApi.login(loginData);
TokenStorage.setTokens(loginResponse.access_token, loginResponse.refresh_token);

// 获取当前用户信息
const currentUser = await authApi.getCurrentUser();
console.log(currentUser); // { id, email, username, fullName, createdAt }

// 退出登录
await authApi.logout(); // 自动清空本地 token
```

### 文件上传流程

```typescript
// 单文件上传
const file = document.querySelector('input[type="file"]').files[0];
const uploadedFile = await filesApi.uploadFile(projectId, file);

// 批量上传
const files = Array.from(document.querySelector('input[type="file"]').files);
const batchResult = await filesApi.batchUpload(projectId, files);
console.log(`成功上传 ${batchResult.total} 个文件`);
if (batchResult.failed.length > 0) {
  console.log('失败的文件:', batchResult.failed);
}

// 标注文件用途
await filesApi.updateIntent(uploadedFile.id, '这是课程的主要参考资料');

// 批量删除
const fileIds = ['file-id-1', 'file-id-2'];
const deleteResult = await filesApi.batchDelete(fileIds);
console.log(`成功删除 ${deleteResult.deleted} 个文件`);
```

### 课件生成流程

```typescript
// 创建生成任务
const generateRequest = {
  project_id: projectId,
  type: 'both' as const,
  options: {
    template: 'gaia',
    theme_color: '#4A90E2',
    show_page_number: true,
    pages: 20,
    include_animations: true,
  },
};

const task = await generateApi.createTask(generateRequest);

// 轮询任务状态
useTaskPolling(task.task_id, (status) => {
  console.log(`进度: ${status.progress}%`);
  
  if (status.status === 'completed') {
    console.log('生成完成！');
    console.log('PPT URL:', status.result?.ppt_url);
    console.log('Word URL:', status.result?.word_url);
  }
});

// 下载文件
const pptBlob = await generateApi.downloadFile(task.task_id, 'ppt');
const url = URL.createObjectURL(pptBlob);
const a = document.createElement('a');
a.href = url;
a.download = 'courseware.pptx';
a.click();

// 查看历史版本
const versions = await generateApi.getVersions(task.task_id);
console.log(`共有 ${versions.versions.length} 个版本`);
```
