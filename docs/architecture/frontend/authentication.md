# Authentication

## 认证方案

前端采用 **JWT Token** 认证方案，支持用户注册、登录、自动刷新。

## Token 存储方案

```typescript
// lib/auth/storage.ts
export const TokenStorage = {
  setAccessToken(token: string) {
    localStorage.setItem('access_token', token);
  },
  
  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  },
  
  clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }
};
```

### 安全考虑

- **XSS 防护**: 使用 httpOnly cookie（生产环境推荐）
- **CSRF 防护**: 使用 SameSite cookie 属性
- **Token 过期**: 实现自动刷新机制

## 认证状态管理

```typescript
// stores/authStore.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  
  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await authService.login(email, password);
      TokenStorage.setAccessToken(response.access_token);
      const user = await authService.getCurrentUser();
      set({ user, isAuthenticated: true });
    } finally {
      set({ isLoading: false });
    }
  },
  
  logout: () => {
    TokenStorage.clearTokens();
    set({ user: null, isAuthenticated: false });
  },
}));
```

## API 拦截器设计

```typescript
// lib/api.ts
import axios from 'axios';
import { TokenStorage } from './auth/storage';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// 请求拦截器 - 添加 Token
apiClient.interceptors.request.use((config) => {
  const token = TokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 处理认证错误
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      // Token 过期，退出登录
      useAuthStore.getState().logout();
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);
```

## Auth Service

```typescript
// lib/services/authService.ts
export const authService = {
  async login(email: string, password: string) {
    return apiClient.post('/auth/login', { email, password });
  },
  
  async register(data: RegisterRequest) {
    return apiClient.post('/auth/register', data);
  },
  
  async getCurrentUser() {
    return apiClient.get('/auth/me');
  },
};
```

## 路由保护

```typescript
// middleware.ts
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth');
  
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
  
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/projects', request.url));
  }
  
  return NextResponse.next();
}
```

## 相关文档

- [Auth Pages](./auth-pages.md) - 登录注册页面设计
- [API Integration](./api-integration.md) - API 客户端配置
