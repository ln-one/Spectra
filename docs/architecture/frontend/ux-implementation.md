# UX Implementation

## 三栏布局实现

```typescript
// components/ThreeColumnLayout.tsx
interface ThreeColumnLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  panel: React.ReactNode;
  sidebarWidth?: number;
  panelWidth?: number;
}

export function ThreeColumnLayout({
  sidebar,
  main,
  panel,
  sidebarWidth = 80,
  panelWidth = 320,
}: ThreeColumnLayoutProps) {
  return (
    <div className="flex h-screen">
      <div
        className="fixed left-0 top-0 h-full border-r"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </div>
      
      <div
        className="flex-1"
        style={{ marginLeft: sidebarWidth, marginRight: panelWidth }}
      >
        {main}
      </div>
      
      <div
        className="fixed right-0 top-0 h-full border-l overflow-y-auto"
        style={{ width: panelWidth }}
      >
        {panel}
      </div>
    </div>
  );
}
```

## 对话式交互实现

```typescript
// components/ChatInterface.tsx
export function ChatInterface({ projectId }: { projectId: string }) {
  const { messages, sendMessage, isTyping } = useChatStore();
  const [input, setInput] = useState('');
  
  const handleSend = async () => {
    if (!input.trim()) return;
    await sendMessage(input);
    setInput('');
  };
  
  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      {isTyping && <TypingIndicator />}
      <MessageInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
      />
    </div>
  );
}
```

## 语音输入实现

```typescript
// components/VoiceRecorder.tsx
export function VoiceRecorder({
  onRecordComplete,
}: {
  onRecordComplete: (audioBlob: Blob) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      onRecordComplete(audioBlob);
      stream.getTracks().forEach((track) => track.stop());
    };
    
    mediaRecorder.start();
    setIsRecording(true);
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  return (
    <Button onClick={isRecording ? stopRecording : startRecording}>
      {isRecording ? <Square /> : <Mic />}
    </Button>
  );
}
```

## 课件预览与溯源实现

```typescript
// components/CoursewarePreview.tsx
export function CoursewarePreview({ taskId }: { taskId: string }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);
  
  return (
    <ThreeColumnLayout
      sidebar={<Sidebar />}
      main={
        <div className="flex flex-col h-full">
          <SlideViewer slide={slides[currentSlide]} />
          <SlideNavigator
            slides={slides}
            currentIndex={currentSlide}
            onSelect={setCurrentSlide}
          />
        </div>
      }
      panel={
        <Tabs defaultValue="lesson-plan">
          <TabsList>
            <TabsTrigger value="lesson-plan">教案</TabsTrigger>
            <TabsTrigger value="modify">修改</TabsTrigger>
            <TabsTrigger value="sources">溯源</TabsTrigger>
          </TabsList>
          <TabsContent value="lesson-plan">
            <LessonPlanView slideIndex={currentSlide} />
          </TabsContent>
        </Tabs>
      }
    />
  );
}
```

## 溯源标记实现

```typescript
// components/SourceBadge.tsx
export function SourceBadge({ source }: { source: Source }) {
  const icon = {
    video: '🎬',
    document: '📄',
    image: '🖼️',
    ai: '💭',
  }[source.type];
  
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div>文件: {source.filename}</div>
        {source.location && <div>位置: {source.location}</div>}
      </TooltipContent>
    </Tooltip>
  );
}
```
