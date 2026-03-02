# Responsive Design

## 断点定义

```typescript
// lib/constants.ts
export const BREAKPOINTS = {
 mobile: 768,
 tablet: 1200,
 desktop: 1920,
};
```

## 媒体查询 Hook

```typescript
// hooks/useMediaQuery.ts
export function useMediaQuery(query: string) {
 const [matches, setMatches] = useState(false);
 
 useEffect(() => {
 const media = window.matchMedia(query);
 setMatches(media.matches);
 
 const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
 media.addEventListener('change', listener);
 
 return () => media.removeEventListener('change', listener);
 }, [query]);
 
 return matches;
}
```

## 响应式布局示例

```typescript
// components/ResponsiveLayout.tsx
export function ResponsiveLayout() {
 const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.mobile}px)`);
 const isTablet = useMediaQuery(
 `(min-width: ${BREAKPOINTS.mobile}px) and (max-width: ${BREAKPOINTS.tablet}px)`
 );
 
 if (isMobile) {
 return <MobileLayout />;
 }
 
 if (isTablet) {
 return <TabletLayout />;
 }
 
 return <DesktopLayout />;
}
```

## 移动端适配

```typescript
// components/ResponsiveChatInterface.tsx
export function ResponsiveChatInterface() {
 const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.mobile}px)`);
 
 if (isMobile) {
 return (
 <div className="flex flex-col h-screen">
 <header className="border-b p-4">
 <h1 className="text-xl font-bold">项目名称</h1>
 </header>
 
 <div className="flex-1 overflow-y-auto">
 <MessageList messages={messages} />
 </div>
 
 <div className="border-t p-4">
 <MessageInput />
 </div>
 
 <nav className="border-t flex justify-around p-2">
 <Button variant="ghost" size="sm">对话</Button>
 <Button variant="ghost" size="sm">文件</Button>
 <Button variant="ghost" size="sm">预览</Button>
 </nav>
 </div>
 );
 }
 
 return <ThreeColumnLayout />;
}
```

## Tailwind 响应式类

```tsx
<div className="
 w-full 
 md:w-1/2 
 lg:w-1/3 
 p-4 
 md:p-6 
 lg:p-8
">
 响应式内容
</div>
```
