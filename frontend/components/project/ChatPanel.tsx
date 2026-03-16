"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Bot,
  User,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  type CitationViewModel,
  toCitationViewModels,
} from "@/lib/chat/citation-view-model";

interface ChatPanelProps {
  projectId: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  citations?: unknown;
}

function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 border-b border-zinc-200">
        <span className="text-[10px] font-medium text-zinc-500 uppercase">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-200 rounded"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-400" />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneLight}
        customStyle={{
          margin: 0,
          padding: "12px 16px",
          fontSize: "12px",
          background: "transparent",
        }}
        codeTagProps={{
          style: {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          },
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

function MarkdownContent({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  const components = useMemo(
    () => ({
      code: ({
        inline,
        className,
        children,
        ...props
      }: {
        inline?: boolean;
        className?: string;
        children?: React.ReactNode;
      } & React.HTMLAttributes<HTMLElement>) => {
        const match = /language-(\w+)/.exec(className || "");
        const codeString = String(children).replace(/\n$/, "");

        if (!inline && match) {
          return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
        }

        return (
          <code
            className={cn(
              "px-1.5 py-0.5 rounded text-[13px] font-mono",
              isUser ? "bg-zinc-800 text-zinc-100" : "bg-zinc-200 text-zinc-800"
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="list-disc list-outside ml-4 mb-2 space-y-1">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="text-sm leading-relaxed">{children}</li>
      ),
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => (
        <em className="italic">{children}</em>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="border-l-2 border-zinc-300 pl-3 my-2 italic text-zinc-600">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-zinc-200" />,
      a: ({
        href,
        children,
      }: {
        href?: string;
        children?: React.ReactNode;
      }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "underline underline-offset-2",
            isUser
              ? "text-zinc-200 hover:text-white"
              : "text-blue-600 hover:text-blue-800"
          )}
        >
          {children}
        </a>
      ),
    }),
    [isUser]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

function splitContentAndSources(content: string): { body: string } {
  const marker = "\n\n来源：";
  const idx = content.indexOf(marker);
  if (idx === -1) {
    return { body: content };
  }
  return { body: content.slice(0, idx).trim() };
}

function MessageBubble({
  message,
  index,
  projectId,
}: {
  message: ChatMessage;
  index: number;
  projectId: string;
}) {
  const isUser = message.role === "user";
  const { focusSourceByChunk } = useProjectStore();
  const { body } = splitContentAndSources(message.content);
  const citations = useMemo(
    () => toCitationViewModels(message.citations),
    [message.citations]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.03,
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          delay: index * 0.03 + 0.1,
          type: "spring",
          stiffness: 500,
          damping: 30,
        }}
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
          isUser
            ? "bg-gradient-to-br from-zinc-800 to-zinc-900"
            : "bg-gradient-to-br from-zinc-100 to-zinc-200"
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-zinc-600" />
        )}
      </motion.div>

      <div
        className={cn(
          "flex flex-col gap-1.5 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <motion.div
          initial={{ opacity: 0, x: isUser ? 10 : -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 + 0.05 }}
          className={cn(
            "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "bg-gradient-to-br from-zinc-800 to-zinc-900 text-white rounded-2xl rounded-tr-sm"
              : "bg-white border border-zinc-200 text-zinc-800 rounded-2xl rounded-tl-sm"
          )}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <div className="relative">
              <MarkdownContent content={body} isUser={isUser} />
              {citations.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {citations.map((citation, i) => (
                    <button
                      key={`${citation.chunkId}-${i}`}
                      onClick={() => focusSourceByChunk(citation.chunkId, projectId)}
                      className="text-[10px] leading-none text-zinc-500 hover:text-zinc-900 transition-colors"
                      aria-label={`引用 ${i + 1}`}
                    >
                      <sup className="px-1 py-0.5 rounded bg-zinc-100 border border-zinc-200">
                        {i + 1}
                      </sup>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>

        {citations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 + 0.15 }}
            className="flex flex-wrap gap-1.5 mt-1"
          >
            {citations.map((citation, i) => (
              <CitationBadge
                key={`${citation.chunkId}-${i}`}
                citation={citation}
                index={i}
                onClick={() => focusSourceByChunk(citation.chunkId, projectId)}
              />
            ))}
          </motion.div>
        )}

        <span className="text-[10px] text-zinc-400 px-1 font-medium">
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </motion.div>
  );
}

function CitationBadge({
  citation,
  index,
  onClick,
}: {
  citation: CitationViewModel;
  index: number;
  onClick: () => void;
}) {
  const sourceLabelMap: Record<CitationViewModel["sourceType"], string> = {
    document: "文档",
    web: "网页",
    video: "视频",
    audio: "音频",
    ai_generated: "AI",
  };

  return (
    <Badge
      variant="outline"
      onClick={onClick}
      className="gap-1.5 px-2.5 py-1 text-[10px] font-medium cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-sm"
      title={citation.contentPreview || citation.filename}
    >
      <span className="text-[10px] font-semibold text-zinc-700">
        {index + 1}
      </span>
      <ExternalLink className="w-3 h-3" />
      <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] text-zinc-600">
        {sourceLabelMap[citation.sourceType]}
      </span>
      <span className="truncate max-w-[100px]">{citation.filename}</span>
      {citation.pageNumber && (
        <span className="text-zinc-400 font-normal">
          P{citation.pageNumber}
        </span>
      )}
      {typeof citation.timestamp === "number" && (
        <span className="text-zinc-400 font-normal">
          {Math.round(citation.timestamp)}s
        </span>
      )}
    </Badge>
  );
}

const SUGGESTIONS = [
  "帮我分析这个文档的核心观点",
  "生成一份教学大纲",
  "总结这个项目的关键内容",
];

export function ChatPanel({ projectId }: ChatPanelProps) {
  const {
    messages,
    isMessagesLoading,
    isSending,
    sendMessage,
    lastFailedInput,
    clearLastFailedInput,
  } = useProjectStore();
  const [input, setInput] = useState("");
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasHydratedHistoryRef = useRef(false);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const behavior =
      hasHydratedHistoryRef.current && messages.length > 0 ? "smooth" : "auto";
    messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    hasHydratedHistoryRef.current = messages.length > 0;
  }, [messages]);

  useEffect(() => {
    hasHydratedHistoryRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (lastFailedInput) {
      setInput(lastFailedInput);
      clearLastFailedInput();
    }
  }, [lastFailedInput, clearLastFailedInput]);

  useEffect(() => {
    if (!isMessagesLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 1800);
    return () => clearTimeout(timer);
  }, [isMessagesLoading]);

  const showLoading =
    isMessagesLoading && !loadingTimedOut && messages.length === 0;

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const content = input.trim();
    setInput("");
    await sendMessage(projectId, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div
      className="h-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
    >
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl overflow-hidden will-change-[box-shadow,transform]">
        <CardHeader
          className="flex flex-row items-center justify-between px-4 space-y-0 py-0 shrink-0"
          style={{ height: "52px" }}
        >
          <div className="flex flex-col justify-center min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold leading-tight">
              Chat
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 leading-tight">
              AI 助手对话
            </CardDescription>
          </div>
          {isSending && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-xs text-zinc-500"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>思考中</span>
            </motion.div>
          )}
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-132px)]">
          <ScrollArea className="h-full px-4">
            <AnimatePresence mode="wait">
              {showLoading ? (
                <motion.div
                  key="chat-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="h-full py-4"
                >
                  <div className="space-y-4">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex gap-3",
                          idx % 2 === 0 ? "justify-start" : "justify-end"
                        )}
                      >
                        <div className="w-8 h-8 rounded-xl bg-zinc-100 animate-pulse shrink-0" />
                        <div className="space-y-2 w-[75%]">
                          <div className="h-3 rounded bg-zinc-100 animate-pulse" />
                          <div className="h-3 w-4/5 rounded bg-zinc-100 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : messages.length === 0 ? (
                <motion.div
                  key="chat-empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="h-full flex flex-col items-center justify-center text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center mb-4 shadow-sm"
                  >
                    <Sparkles className="w-7 h-7 text-zinc-500" />
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-sm font-semibold text-zinc-700"
                  >
                    开始对话
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-xs text-zinc-500 mt-1 mb-4"
                  >
                    向 AI 助手提问关于项目的问题
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap gap-2 justify-center max-w-[280px]"
                  >
                    {SUGGESTIONS.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="chat-messages"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 py-4"
                >
                  <AnimatePresence mode="popLayout">
                    {messages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        index={index}
                        projectId={projectId}
                      />
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>
        </CardContent>

        <CardFooter className="px-4 py-3 border-t border-zinc-100 flex-col gap-2">
          <div className="flex items-end gap-2 w-full">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="min-h-[44px] max-h-[120px] resize-none rounded-xl bg-zinc-50 border-zinc-200 focus:border-zinc-400 focus:ring-zinc-200 transition-colors"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className={cn(
                "shrink-0 rounded-xl w-11 h-11 transition-all duration-200",
                input.trim() && !isSending
                  ? "bg-gradient-to-br from-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 shadow-md hover:shadow-lg"
                  : "bg-zinc-100 text-zinc-400"
              )}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center w-full">
            按 Enter 发送，Shift + Enter 换行
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
