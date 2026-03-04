/**
 * E2E API Integration Tests
 *
 * 这些测试用于验证前端与后端 API 的完整集成。
 * 运行方式: npm run test -- e2e/api-integration.spec.ts
 *
 * 注意: 这些测试需要后端服务运行在 http://localhost:8000
 */

import { authApi } from "../lib/api/auth";
import { projectsApi } from "../lib/api/projects";
import { filesApi } from "../lib/api/files";
import { chatApi } from "../lib/api/chat";
import { generateApi } from "../lib/api/generate";
import { previewApi } from "../lib/api/preview";
import { ragApi } from "../lib/api/rag";

// 测试配置
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: "Test123456!",
  username: `testuser-${Date.now()}`,
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 检查后端是否可用
async function checkBackendAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return response.ok;
  } catch {
    return false;
  }
}

describe("API Integration Tests", () => {
  let _authToken: string;
  let testProjectId: string;
  let testFileId: string;
  let testTaskId: string;
  let backendAvailable = false;

  beforeAll(async () => {
    backendAvailable = await checkBackendAvailable();
    if (!backendAvailable) {
      console.warn("Backend is not available, skipping API integration tests");
    }
  });

  describe("Auth Flow", () => {
    it("should register a new user", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await authApi.register({
        email: TEST_USER.email,
        password: TEST_USER.password,
        username: TEST_USER.username,
      });

      expect(response.success).toBe(true);
      expect(response.data.access_token).toBeDefined();
      _authToken = response.data.access_token!;
    });

    it("should login with registered user", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await authApi.login({
        email: TEST_USER.email,
        password: TEST_USER.password,
      });

      expect(response.success).toBe(true);
      expect(response.data.access_token).toBeDefined();
      _authToken = response.data.access_token!;
    });

    it("should get current user info", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await authApi.getCurrentUser();

      expect(response.success).toBe(true);
      expect(response.data.user).toBeDefined();
      expect(response.data.user?.email).toBe(TEST_USER.email);
    });
  });

  describe("Projects Flow", () => {
    it("should get empty project list initially", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await projectsApi.getProjects();

      expect(response.success).toBe(true);
      expect(response.data.projects).toBeDefined();
      expect(Array.isArray(response.data.projects)).toBe(true);
    });

    it("should create a new project", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await projectsApi.createProject({
        name: "Test Project",
        description: "This is a test project",
        grade_level: "初中",
      });

      expect(response.success).toBe(true);
      expect(response.data.project).toBeDefined();
      expect(response.data.project?.name).toBe("Test Project");
      testProjectId = response.data.project!.id;
    });

    it("should get project details", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await projectsApi.getProject(testProjectId);

      expect(response.success).toBe(true);
      expect(response.data.project).toBeDefined();
      expect(response.data.project?.id).toBe(testProjectId);
    });

    it("should update project", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await projectsApi.updateProject(testProjectId, {
        name: "Updated Test Project",
        description: "Updated description",
        grade_level: "高中",
      });

      expect(response.success).toBe(true);
      expect(response.data.project?.name).toBe("Updated Test Project");
    });

    it("should search projects", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await projectsApi.searchProjects({
        q: "Test",
      });

      expect(response.success).toBe(true);
      expect(response.data.projects).toBeDefined();
    });
  });

  describe("Files Flow", () => {
    it("should get project files", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await filesApi.getProjectFiles(testProjectId);

      expect(response.success).toBe(true);
      expect(response.data.files).toBeDefined();
      expect(Array.isArray(response.data.files)).toBe(true);
    });

    it.skip("should upload a file", async () => {
      if (!backendAvailable) {
        return;
      }

      const testFile = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });

      const response = await filesApi.uploadFile(testFile, testProjectId);

      expect(response.success).toBe(true);
      expect(response.data.file).toBeDefined();
      testFileId = response.data.file!.id;
    });

    it.skip("should delete a file", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await filesApi.deleteFile(testFileId);

      expect(response.success).toBe(true);
    });
  });

  describe("Chat Flow", () => {
    it("should get chat messages", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await chatApi.getMessages(testProjectId);

      expect(response.success).toBe(true);
      expect(response.data.messages).toBeDefined();
      expect(Array.isArray(response.data.messages)).toBe(true);
    });

    it.skip("should send a chat message", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await chatApi.sendMessage({
        project_id: testProjectId,
        content: "Hello, AI assistant!",
      });

      expect(response.success).toBe(true);
      expect(response.data.message).toBeDefined();
    });
  });

  describe("Generate Flow", () => {
    it.skip("should create generate task", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await generateApi.generateCourseware({
        project_id: testProjectId,
        type: "ppt",
        start_mode: "direct_generate",
        options: {
          template: "default",
          show_page_number: true,
          include_animations: false,
          include_games: false,
          use_text_to_image: false,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data.task_id).toBeDefined();
      testTaskId = response.data.task_id!;
    });

    it.skip("should get generate status", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await generateApi.getGenerateStatus(testTaskId);

      expect(response.success).toBe(true);
      expect(response.data.status).toBeDefined();
    });
  });

  describe("Preview Flow", () => {
    it.skip("should get preview", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await previewApi.getPreview(testTaskId);

      expect(response.success).toBe(true);
      expect(response.data.task_id).toBe(testTaskId);
    });

    it.skip("should modify preview", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await previewApi.modifyPreview(testTaskId, {
        instruction: "请优化PPT的排版",
      });

      expect(response.success).toBe(true);
      expect(response.data.modify_task_id).toBeDefined();
    });
  });

  describe("RAG Flow", () => {
    it.skip("should search RAG", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await ragApi.search({
        project_id: testProjectId,
        query: "test query",
        top_k: 5,
      });

      expect(response.success).toBe(true);
      expect(response.data.results).toBeDefined();
    });

    it.skip("should find similar content", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await ragApi.findSimilar({
        text: "test text",
        top_k: 5,
      });

      expect(response.success).toBe(true);
      expect(response.data.results).toBeDefined();
    });
  });

  describe("Cleanup", () => {
    it("should delete test project", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await projectsApi.deleteProject(testProjectId);

      expect(response.success).toBe(true);
    });

    it("should logout", async () => {
      if (!backendAvailable) {
        return;
      }

      const response = await authApi.logout();

      expect(response.success).toBe(true);
    });
  });
});
