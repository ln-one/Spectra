# Auth Pages Design

## 登录页面

```typescript
// app/auth/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function LoginPage() {
 const router = useRouter();
 const { login, isLoading } = useAuthStore();
 const { toast } = useToast();
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 try {
 await login(email, password);
 router.push('/projects');
 } catch (error) {
 toast({ 
 title: '登录失败',
 description: error instanceof Error ? error.message : '请稍后重试',
 variant: 'destructive' 
 });
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

```typescript
// app/auth/register/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function RegisterPage() {
 const router = useRouter();
 const { register, isLoading } = useAuthStore();
 const { toast } = useToast();
 
 const [email, setEmail] = useState('');
 const [username, setUsername] = useState('');
 const [fullName, setFullName] = useState('');
 const [password, setPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 
 if (password !== confirmPassword) {
 toast({ 
 title: '密码不匹配', 
 variant: 'destructive' 
 });
 return;
 }
 
 try {
 await register(email, password, username, fullName || undefined);
 router.push('/projects');
 } catch (error) {
 toast({ 
 title: '注册失败', 
 description: error instanceof Error ? error.message : '请稍后重试',
 variant: 'destructive' 
 });
 }
 };

 return (
 <div className="flex items-center justify-center min-h-screen">
 <Card className="w-full max-w-md p-6">
 <h1 className="text-2xl font-bold mb-6">注册 Spectra</h1>
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
 <Label htmlFor="username">用户名</Label>
 <Input
 id="username"
 value={username}
 onChange={(e) => setUsername(e.target.value)}
 pattern="^[a-zA-Z0-9_-]+$"
 title="只能包含字母、数字、下划线和连字符"
 minLength={3}
 maxLength={50}
 required
 />
 </div>
 
 <div>
 <Label htmlFor="fullName">姓名（可选）</Label>
 <Input
 id="fullName"
 value={fullName}
 onChange={(e) => setFullName(e.target.value)}
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
