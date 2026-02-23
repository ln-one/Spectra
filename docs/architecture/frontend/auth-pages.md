# Auth Pages Design

## 登录页面

> REVIEW-P1(important) 问题：示例中使用 `toast(...)`，但未展示导入来源，示例缺失必要上下文。
> REVIEW-P1(important) 建议：补充完整的导入语句（包括 toast 来源）和必要依赖上下文。

```typescript
// app/auth/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
// TODO: 导入 toast 实现（e.g., react-hot-toast, sonner 等）

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/projects');
    } catch (error) {
      toast({ title: '登录失败', variant: 'destructive' });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-6">登录 Spectra</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '登录中...' : '登录'}
          </Button>
          
          <div className="text-center text-sm">
            还没有账号？{' '}
            <a href="/auth/register" className="text-blue-600">
              立即注册
            </a>
          </div>
        </form>
      </Card>
    </div>
  );
}
```

## 注册页面

> REVIEW-P0(blocking) 问题：示例调用 `register(email, password, name)`，与 `frontend/stores/authStore.ts` 当前签名（`username/fullName`）不一致。  
> REVIEW-P0(blocking) 建议：统一注册参数命名，并在本页与 `authentication.md` 同步更新。

```typescript
// app/auth/register/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({ title: '密码不匹配', variant: 'destructive' });
      return;
    }
    
    try {
      await register(email, password, name);
      router.push('/projects');
    } catch (error) {
      toast({ title: '注册失败', variant: 'destructive' });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-6">注册 Spectra</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">姓名</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          
          <div>
            <Label htmlFor="confirmPassword">确认密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '注册中...' : '注册'}
          </Button>
          
          <div className="text-center text-sm">
            已有账号？{' '}
            <a href="/auth/login" className="text-blue-600">
              立即登录
            </a>
          </div>
        </form>
      </Card>
    </div>
  );
}
```

## 页面布局

- 居中卡片设计
- 简洁的表单
- 清晰的错误提示
- 响应式适配
