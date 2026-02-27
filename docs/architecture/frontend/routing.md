# Routing Design

## 路由设计

```
/                           # 首页（Dashboard）
/projects                   # 项目列表
/projects/new               # 创建新项目
/projects/[id]              # 项目详情
/projects/[id]/chat         # 对话页面
/projects/[id]/preview      # 预览与修改页面
/projects/[id]/generate     # 生成页面
/projects/[id]/settings     # 项目设置
/upload                     # 文件上传管理
/settings                   # 全局设置
```

## 页面结构

### 1. Dashboard (`/`)

**布局**: 侧边栏 + 主工作区

**功能**:
- 显示最近项目
- 快速创建新项目
- 文件上传入口
- 统计信息展示

**组件**:
- `Sidebar` - 全局导航
- `ProjectList` - 项目列表
- `QuickActions` - 快速操作
- `FileUploadDropzone` - 文件上传

### 2. Project Detail (`/projects/[id]`)

**布局**: 三栏布局（侧边栏 + 对话区 + 信息面板）

**功能**:
- 多轮对话交互
- 文件上传与标注
- 需求确认
- 生成任务创建

**组件**:
- `ChatInterface` - 对话界面
- `MessageList` - 消息列表
- `MessageInput` - 输入框（文字/语音）
- `FileUploadPanel` - 文件管理面板
- `FileStatusList` - 文件状态列表
- `VideoKeyframeSelector` - 视频关键帧选择器
- `ProgressTracker` - 进度跟踪

### 3. Preview & Modify (`/projects/[id]/preview`)

**布局**: 三栏布局（PPT 预览 + 对话修改 + 教案同步视图）

**功能**:
- PPT 预览与导航
- 对话式修改
- 教案同步显示
- 内容溯源
- 导出下载

**组件**:
- `CoursewarePreview` - 课件预览
- `SlideNavigator` - 幻灯片导航
- `ModifyChat` - 修改对话
- `LessonPlanView` - 教案同步视图
- `SourceTracker` - 溯源面板
- `QuickActions` - 快速操作按钮
