# 前端 API 更新清单

## 需要更新的模块

根据最新的 OpenAPI 规范，以下模块需要更新：

### 1. 已实现的模块（无需更新）

- `auth.ts` - 认证 API
- `projects.ts` - 项目 CRUD
- `preview.ts` - 预览 API
- `rag.ts` - RAG 检索

### 2. 需要更新的模块

#### A. `generate.ts` - 生成 API

**说明**：

- 旧的任务型接口（`/api/v1/generate/tasks/*`）已移除。
- 统一使用 `session-first` 路径：`/api/v1/generate/sessions*`。
- 本清单中与旧接口相关的 TODO 已失效，可忽略。

#### B. `chat.ts` - 对话 API

**新增功能**：

1. **语音输入接口** (P1 - 可选)

```typescript
async sendVoiceMessage(
 audio: File,
 projectId: string
): Promise<VoiceMessageResponse> {
 // POST /api/v1/chat/voice
 // Content-Type: multipart/form-data
}

interface VoiceMessageResponse {
 success: boolean;
 data: {
 text: string; // 识别的文本
 confidence: number; // 识别置信度
 duration: number; // 音频时长
 message: Message; // 自动创建的消息
 suggestions?: string[];
 };
 message: string;
}
```

#### C. `files.ts` - 文件 API

**增强功能**：

1. **文件解析状态增强**

```typescript
interface UploadedFile {
  // ... 现有字段
  parse_progress?: number; // 新增：解析进度 0-100
  parse_details?: {
    // 新增：解析详情
    pages_extracted?: number;
    images_extracted?: number;
    text_length?: number;
    duration?: number; // 视频时长
  };
  parse_error?: string; // 新增：解析错误信息
}
```

### 3. 实现优先级

#### P0 - 立即实现（本周）

- 文件下载接口 (`generate.ts`)
- 路径更新 (`generate.ts`)
- 基础模板选项 (`generate.ts`)

#### P1 - 重要功能（下周）

- 语音输入接口 (`chat.ts`)
- 版本管理接口 (`generate.ts`)
- 文件解析状态增强 (`files.ts`)

#### P2 - 可选功能（后续迭代）

- 动画和游戏生成选项
- 高级模板配置

## 具体修改建议

### 1. 更新 `generate.ts`

```typescript
// 添加下载方法
async downloadCourseware(
 taskId: string,
 fileType: 'ppt' | 'word'
): Promise<Blob> {
 if (MOCK_MODE) {
 // Mock 实现
 await new Promise(resolve => setTimeout(resolve, 500));
 return new Blob(['mock file content'], {
 type: fileType === 'ppt'
 ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
 : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 });
 }

 const response = await fetch(
 getApiUrl(\`/generate/tasks/\${taskId}/download?file_type=\${fileType}\`),
 {
 method: 'GET',
 headers: {
 'Authorization': \`Bearer \${localStorage.getItem('access_token')}\`
 }
 }
 );

 if (!response.ok) throw new Error('下载失败');
 return response.blob();
}

// 更新路径
async getGenerateStatus(taskId: string): Promise<GenerateStatusResponse> {
 // 旧路径: /generate/status/${taskId}
 // 新路径: /generate/tasks/${taskId}/status
 return request<GenerateStatusResponse>(\`/generate/tasks/\${taskId}/status\`, {
 method: "GET",
 });
}
```

### 2. 更新 `chat.ts` (可选)

```typescript
// 添加语音输入方法
async sendVoiceMessage(
 audio: File,
 projectId: string
): Promise<VoiceMessageResponse> {
 if (MOCK_MODE) {
 await new Promise(resolve => setTimeout(resolve, 2000));
 return {
 success: true,
 data: {
 text: "这是模拟的语音识别结果",
 confidence: 0.95,
 duration: audio.size / 16000, // 模拟时长
 message: {
 id: \`msg-\${Date.now()}\`,
 role: 'user',
 content: "这是模拟的语音识别结果",
 timestamp: new Date().toISOString()
 },
 suggestions: ["继续对话", "生成课件"]
 },
 message: "识别成功"
 };
 }

 const formData = new FormData();
 formData.append('audio', audio);
 formData.append('project_id', projectId);

 return request<VoiceMessageResponse>('/chat/voice', {
 method: 'POST',
 body: formData,
 // 注意：FormData 会自动设置 Content-Type
 });
}
```

### 3. 更新类型定义

```bash
# 重新生成类型文件
cd frontend
npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts
```

## 验证清单

更新完成后，请验证：

- [ ] 类型定义已更新
- [ ] 文件下载功能正常
- [ ] 路径更新后接口调用正常
- [ ] Mock 模式下所有功能可用
- [ ] 构建无错误
- [ ] ESLint 检查通过

## 相关文档

- [OpenAPI 规范](../docs/openapi.yaml)
- [OpenAPI 使用指南](../docs/OPENAPI_GUIDE.md)
- [API 增强总结](../docs/API_ENHANCEMENTS_SUMMARY.md)
