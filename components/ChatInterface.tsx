import React, { useEffect, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  RotateCcw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ModelLogo } from '@/components/ModelLogo';
import { getClientErrorMessage } from '@/lib/client-errors';
import { estimateTextTokens, formatTokenRate } from '@/lib/token-metrics';
import { AppConfig, ChatSession } from '@/lib/types';

import { InputArea } from './InputArea';

interface ChatInterfaceProps {
  activeView: 'comparison' | string;
  config: AppConfig;
  loadedSession?: ChatSession | null;
}

type MarkdownCodeProps = React.ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
  node?: unknown;
};

function ThinkingBlock({ content, isGenerating, isClosed }: { content: string; isGenerating: boolean; isClosed: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const wasThinkingRef = useRef(true);

  useEffect(() => {
    const wasThinking = wasThinkingRef.current;
    wasThinkingRef.current = !isClosed;
    if (wasThinking && isClosed) {
      const timerId = window.setTimeout(() => {
        setIsOpen(false);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
      };
    }
  }, [isClosed]);

  if (!content) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-slate-100/50"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Bot className="h-3.5 w-3.5" />
          <span>Thinking Process</span>
          {isGenerating && !isClosed && (
            <span className="flex gap-0.5">
              <span className="h-1 w-1 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: '0ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: '150ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-3 pt-1 text-sm leading-relaxed text-slate-500 italic whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => extractText(item)).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }

  return '';
}

function parseThinkingContent(content: string) {
  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  const isClosed = /<\/think>/i.test(content);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const remaining = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
    return { thinking, remaining, isClosed };
  }
  return { thinking: '', remaining: content, isClosed: false };
}

function MarkdownCode({
  children,
  className,
  inline,
  node,
  ...props
}: MarkdownCodeProps) {
  const [copied, setCopied] = useState(false);
  const codeText = extractText(children).replace(/\n$/, '');
  const parentTagName = (node as { parent?: { tagName?: string } } | undefined)?.parent
    ?.tagName;
  const isInline = inline ?? parentTagName !== 'pre';

  const handleCopy = async () => {
    if (!codeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  if (isInline) {
    return (
      <code
        className="rounded bg-slate-100 px-1 py-0.5 text-[0.92em] text-slate-800"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="group/code relative max-w-full overflow-hidden rounded-lg bg-slate-900">
      <button
        type="button"
        onClick={handleCopy}
        title="Copy code"
        aria-label="Copy code"
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-slate-700/45 text-white/85 opacity-0 backdrop-blur-sm transition-all duration-150 group-hover/code:opacity-100 hover:bg-slate-700/65"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="m-0 max-w-full overflow-x-auto p-3">
        <code
          className={`block whitespace-pre text-xs leading-6 text-slate-50 ${className || ''}`}
          {...props}
        >
          {codeText}
        </code>
      </pre>
    </div>
  );
}

const markdownComponents = {
  pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => <>{children}</>,
  code: MarkdownCode,
};

function MessageRenderer({
  content,
  isLoading,
  markdownClassName,
}: {
  content: string;
  isLoading: boolean;
  markdownClassName: string;
}) {
  const { thinking, remaining, isClosed } = parseThinkingContent(content);

  return (
    <>
      <ThinkingBlock content={thinking} isGenerating={isLoading} isClosed={isClosed} />
      {remaining && (
        <div className={markdownClassName}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {remaining}
          </ReactMarkdown>
        </div>
      )}
    </>
  );
}

export function ChatInterface({
  activeView,
  config,
  loadedSession,
}: ChatInterfaceProps) {
  const { status } = useSession();
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [isSessionSyncing, setIsSessionSyncing] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [tokensPerSecondA, setTokensPerSecondA] = useState(0);
  const [tokensPerSecondB, setTokensPerSecondB] = useState(0);
  const [totalDurationA, setTotalDurationA] = useState(0);
  const [totalDurationB, setTotalDurationB] = useState(0);
  const [messageStats, setMessageStats] = useState<Record<string, { duration: number; tps: number }>>({});
  const [sessionSeed] = useState(() => ({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }));
  const saveTimeoutRef = useRef<number | null>(null);
  const streamStatsARef = useRef<{ baselineTokens: number; startedAt: number }>({
    baselineTokens: 0,
    startedAt: 0,
  });
  const streamStatsBRef = useRef<{ baselineTokens: number; startedAt: number }>({
    baselineTokens: 0,
    startedAt: 0,
  });

  const getModel = (id: string) => config.models.find((model) => model.id === id);

  const modelAConfig =
    activeView === 'comparison'
      ? getModel(config.comparison.modelAId)
      : getModel(activeView);
  const modelBConfig =
    activeView === 'comparison'
      ? getModel(config.comparison.modelBId)
      : null;

  const {
    messages: messagesA,
    isLoading: isLoadingA,
    append: appendA,
    reload: reloadA,
    setMessages: setMessagesA,
  } = useChat({
    api: '/api/chat',
    streamProtocol: 'text',
    body: {
      modelConfig: modelAConfig ? { id: modelAConfig.id } : null,
    },
    id: `chat-${modelAConfig?.id || 'a'}`,
    onError: async (error: unknown) => {
      setErrorA(await getClientErrorMessage(error, 'Request failed.'));
    },
    onFinish: () => setErrorA(null),
  });

  const {
    messages: messagesB,
    isLoading: isLoadingB,
    append: appendB,
    reload: reloadB,
    setMessages: setMessagesB,
  } = useChat({
    api: '/api/chat',
    streamProtocol: 'text',
    body: {
      modelConfig: modelBConfig ? { id: modelBConfig.id } : null,
    },
    id: `chat-${modelBConfig?.id || 'b'}`,
    onError: async (error: unknown) => {
      setErrorB(await getClientErrorMessage(error, 'Request failed.'));
    },
    onFinish: () => setErrorB(null),
  });

  useEffect(() => {
    let timerId: number | null = null;
    
    // Defer state update to avoid cascading renders
    const syncSession = () => {
      setIsSessionSyncing(true);

      if (!loadedSession) {
        setMessagesA([]);
        setMessagesB([]);
        timerId = window.setTimeout(() => {
          setIsSessionSyncing(false);
        }, 0);
        return;
      }

      setMessagesA(loadedSession.messagesA || []);
      setMessagesB(loadedSession.messagesB || []);
      timerId = window.setTimeout(() => {
        setIsSessionSyncing(false);
      }, 0);
    };

    syncSession();

    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [loadedSession, setMessagesA, setMessagesB]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleSend = async (message: string) => {
    const nextMessage = { role: 'user' as const, content: message };

    if (activeView === 'comparison') {
      await Promise.all([appendA(nextMessage), appendB(nextMessage)]);
      return;
    }

    await appendA(nextMessage);
  };

  const isLoading = isLoadingA || isLoadingB;
  const sessionId = loadedSession?.id || sessionSeed.id;
  const createdAt = loadedSession?.createdAt || sessionSeed.createdAt;

  useEffect(() => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (status !== 'authenticated' || isLoading || isSessionSyncing) {
      return;
    }

    if (!sessionId || (messagesA.length === 0 && messagesB.length === 0)) {
      return;
    }

    const firstUserMessage =
      messagesA.find((message) => message.role === 'user') ||
      messagesB.find((message) => message.role === 'user');
    const rawTitle = firstUserMessage?.content || '';
    const title =
      rawTitle.length > 60
        ? `${rawTitle.slice(0, 60)}...`
        : rawTitle || (activeView === 'comparison' ? 'Model comparison' : 'Chat session');

    const payload: ChatSession = {
      id: sessionId,
      title,
      createdAt,
      type: activeView === 'comparison' ? 'comparison' : 'single',
      modelAId:
        activeView === 'comparison'
          ? config.comparison.modelAId
          : modelAConfig?.id || '',
      modelBId:
        activeView === 'comparison' ? config.comparison.modelBId || undefined : undefined,
      messagesA,
      messagesB: activeView === 'comparison' ? messagesB : [],
    };

    saveTimeoutRef.current = window.setTimeout(() => {
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(() => {
          window.dispatchEvent(new Event('storage-sessions'));
        })
        .catch(() => {});
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    activeView,
    config.comparison.modelAId,
    config.comparison.modelBId,
    createdAt,
    isSessionSyncing,
    isLoading,
    messagesA,
    messagesB,
    modelAConfig?.id,
    sessionId,
    status,
  ]);

  const userMessages =
    activeView === 'comparison'
      ? messagesA.filter((message) => message.role === 'user')
      : [];
  const assistantMessagesA =
    activeView === 'comparison'
      ? messagesA.filter((message) => message.role === 'assistant')
      : messagesA;
  const assistantMessagesB =
    activeView === 'comparison'
      ? messagesB.filter((message) => message.role === 'assistant')
      : messagesB;
  const totalAssistantTokensA = estimateTextTokens(
    assistantMessagesA.map((message) => message.content).join('\n'),
  );
  const totalAssistantTokensB = estimateTextTokens(
    assistantMessagesB.map((message) => message.content).join('\n'),
  );
  const lastAssistantMessageIdA =
    assistantMessagesA[assistantMessagesA.length - 1]?.id;
  const lastAssistantMessageIdB =
    assistantMessagesB[assistantMessagesB.length - 1]?.id;

  useEffect(() => {
    if (isLoadingA) {
      if (streamStatsARef.current.startedAt === 0) {
        streamStatsARef.current.startedAt = Date.now();
        streamStatsARef.current.baselineTokens = totalAssistantTokensA;
        const timerId = window.setTimeout(() => {
          setTokensPerSecondA(0);
          setTotalDurationA(0);
        }, 0);
        return () => {
          window.clearTimeout(timerId);
        };
      }

      const elapsedSeconds = Math.max(
        (Date.now() - streamStatsARef.current.startedAt) / 1000,
        0.001,
      );
      const generatedTokens = Math.max(
        totalAssistantTokensA - streamStatsARef.current.baselineTokens,
        0,
      );
      const nextTokensPerSecond = generatedTokens / elapsedSeconds;
      setTotalDurationA((current) =>
        current === elapsedSeconds ? current : elapsedSeconds,
      );
      setTokensPerSecondA((current) =>
        current === nextTokensPerSecond ? current : nextTokensPerSecond,
      );
      return;
    }

    if (streamStatsARef.current.startedAt > 0) {
      const elapsedSeconds = Math.max(
        (Date.now() - streamStatsARef.current.startedAt) / 1000,
        0.001,
      );
      const generatedTokens = Math.max(
        totalAssistantTokensA - streamStatsARef.current.baselineTokens,
        0,
      );

      if (lastAssistantMessageIdA) {
        const nextTokensPerSecond = generatedTokens / elapsedSeconds;
        setMessageStats((prev) => {
          const existing = prev[lastAssistantMessageIdA];
          if (
            existing &&
            existing.duration === elapsedSeconds &&
            existing.tps === nextTokensPerSecond
          ) {
            return prev;
          }

          return {
            ...prev,
            [lastAssistantMessageIdA]: {
              duration: elapsedSeconds,
              tps: nextTokensPerSecond,
            },
          };
        });
      }
    }
    streamStatsARef.current.startedAt = 0;
    streamStatsARef.current.baselineTokens = totalAssistantTokensA;
  }, [isLoadingA, totalAssistantTokensA, lastAssistantMessageIdA]);

  useEffect(() => {
    if (activeView !== 'comparison') {
      streamStatsBRef.current.startedAt = 0;
      streamStatsBRef.current.baselineTokens = 0;
      return;
    }

    if (isLoadingB) {
      if (streamStatsBRef.current.startedAt === 0) {
        streamStatsBRef.current.startedAt = Date.now();
        streamStatsBRef.current.baselineTokens = totalAssistantTokensB;
        const timerId = window.setTimeout(() => {
          setTokensPerSecondB(0);
          setTotalDurationB(0);
        }, 0);
        return () => {
          window.clearTimeout(timerId);
        };
      }

      const elapsedSeconds = Math.max(
        (Date.now() - streamStatsBRef.current.startedAt) / 1000,
        0.001,
      );
      const generatedTokens = Math.max(
        totalAssistantTokensB - streamStatsBRef.current.baselineTokens,
        0,
      );
      const nextTokensPerSecond = generatedTokens / elapsedSeconds;
      setTotalDurationB((current) =>
        current === elapsedSeconds ? current : elapsedSeconds,
      );
      setTokensPerSecondB((current) =>
        current === nextTokensPerSecond ? current : nextTokensPerSecond,
      );
      return;
    }

    if (streamStatsBRef.current.startedAt > 0) {
      const elapsedSeconds = Math.max(
        (Date.now() - streamStatsBRef.current.startedAt) / 1000,
        0.001,
      );
      const generatedTokens = Math.max(
        totalAssistantTokensB - streamStatsBRef.current.baselineTokens,
        0,
      );

      if (lastAssistantMessageIdB) {
        const nextTokensPerSecond = generatedTokens / elapsedSeconds;
        setMessageStats((prev) => {
          const existing = prev[lastAssistantMessageIdB];
          if (
            existing &&
            existing.duration === elapsedSeconds &&
            existing.tps === nextTokensPerSecond
          ) {
            return prev;
          }

          return {
            ...prev,
            [lastAssistantMessageIdB]: {
              duration: elapsedSeconds,
              tps: nextTokensPerSecond,
            },
          };
        });
      }
    }
    streamStatsBRef.current.startedAt = 0;
    streamStatsBRef.current.baselineTokens = totalAssistantTokensB;
  }, [activeView, isLoadingB, totalAssistantTokensB, lastAssistantMessageIdB]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setMessageStats({});
      setTokensPerSecondA(0);
      setTokensPerSecondB(0);
      setTotalDurationA(0);
      setTotalDurationB(0);
    }, 0);
    streamStatsARef.current.startedAt = 0;
    streamStatsARef.current.baselineTokens = 0;
    streamStatsBRef.current.startedAt = 0;
    streamStatsBRef.current.baselineTokens = 0;
    return () => {
      window.clearTimeout(timerId);
    };
  }, [sessionId, activeView, modelAConfig?.id, modelBConfig?.id]);

  const handleEdit = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditContent(content);
  };

  const confirmEdit = async (messageId: string) => {
    if (!editContent.trim()) {
      return;
    }

    const indexA = messagesA.findIndex((m) => m.id === messageId);
    if (indexA !== -1) {
      const truncatedMessagesA = messagesA.slice(0, indexA);
      setMessagesA(truncatedMessagesA);
      
      if (activeView === 'comparison') {
        const indexB = messagesB.findIndex((m) => m.id === messageId);
        if (indexB !== -1) {
          const truncatedMessagesB = messagesB.slice(0, indexB);
          setMessagesB(truncatedMessagesB);
        }
        await Promise.all([appendA({ role: 'user', content: editContent }), appendB({ role: 'user', content: editContent })]);
      } else {
        await appendA({ role: 'user', content: editContent });
      }
    }
    setEditingMessageId(null);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleDelete = (model: 'A' | 'B', messageId: string) => {
    if (model === 'A') {
      setMessagesA((current) => current.filter((m) => m.id !== messageId));
    } else {
      setMessagesB((current) => current.filter((m) => m.id !== messageId));
    }
  };

  const handleRegenerate = (model: 'A' | 'B') => {
    if (model === 'A') {
      reloadA();
    } else {
      reloadB();
    }
  };

  if (!modelAConfig && activeView !== 'comparison') {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Model not found
      </div>
    );
  }


  const canSend =
    status === 'authenticated' &&
    Boolean(modelAConfig) &&
    (activeView !== 'comparison' || Boolean(modelBConfig));

  const inputPlaceholder =
    status !== 'authenticated'
      ? 'Sign in to configure models and start comparing.'
      : activeView === 'comparison' && (!modelAConfig || !modelBConfig)
        ? 'Select both models to start comparing.'
        : !modelAConfig
          ? 'Select a model to start chatting.'
          : 'Ask anything...';

  const disabledHint =
    status !== 'authenticated'
      ? 'Guest mode is read-only. Sign in to save settings and run comparisons.'
      : activeView === 'comparison' && (!modelAConfig || !modelBConfig)
        ? 'Choose both models before sending a prompt.'
        : !modelAConfig
          ? 'Choose a model before sending a prompt.'
          : undefined;
  const markdownClassName =
    'prose prose-sm max-w-none break-words prose-p:my-1 prose-headings:my-2 prose-img:rounded-lg prose-img:shadow-md [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:text-slate-50 [&_pre]:p-3 [&_code]:break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto';

  const comparisonContent = (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div className="h-full overflow-y-auto pb-32">
        <div className="mx-auto w-full px-4 py-8 md:px-6 lg:px-8 space-y-7">
          {userMessages.length === 0 && assistantMessagesA.length === 0 && assistantMessagesB.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
              <div className="p-4 rounded-2xl mb-4 bg-slate-100">
                <Bot className="h-12 w-12 text-slate-300" />
              </div>
              <p className="font-medium">Ready to compare</p>
            </div>
          )}

          {userMessages.map((userMsg, idx) => {
            const assistantMsgA = assistantMessagesA[idx];
            const assistantMsgB = assistantMessagesB[idx];
            const isLast = idx === userMessages.length - 1;
            const isEditing = editingMessageId === userMsg.id;

            return (
              <div key={userMsg.id} className="space-y-4">
                <div className="flex justify-end group/user">
                  <div className="max-w-[70%] animate-in slide-in-from-right-2 duration-300 min-w-0">
                    {isEditing ? (
                      <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full bg-slate-700 text-white text-sm rounded-lg p-2 outline-none focus:ring-1 focus:ring-blue-400 min-h-[80px]"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelEdit} className="px-3 py-1 text-xs text-slate-300 hover:text-white transition-colors">Cancel</button>
                          <button onClick={() => confirmEdit(userMsg.id)} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors flex items-center gap-1.5"><Check className="h-3 w-3" />Confirm</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="bg-slate-800 text-white rounded-2xl rounded-tr-none px-5 py-3.5 text-sm leading-relaxed shadow-sm min-w-0 overflow-hidden">
                          <div className={markdownClassName}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{userMsg.content}</ReactMarkdown>
                          </div>
                        </div>
                        <button
                          onClick={() => handleEdit(userMsg.id, userMsg.content)}
                          className="absolute -bottom-6 right-0 opacity-0 group-hover/user:opacity-100 transition-opacity p-1 text-slate-400 hover:text-blue-500 bg-white/80 rounded-md shadow-sm border border-slate-100"
                          title="Edit message"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 min-w-0">
                  <div className="space-y-4 min-w-0">
                    {assistantMsgA ? (
                      <div className="group/msg relative animate-in slide-in-from-bottom-2 duration-300 min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed shadow-sm text-slate-700 min-w-0 overflow-hidden pb-10">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo model={modelAConfig} size="sm" className="h-6 w-6 rounded-lg text-[10px]" />
                            <span className="text-[11px] font-semibold text-blue-600 truncate block">
                              {modelAConfig?.name || modelAConfig?.modelId || 'Model A'}
                            </span>
                          </div>
                          <MessageRenderer content={assistantMsgA.content} isLoading={isLast && isLoadingA} markdownClassName={markdownClassName} />
                          <div className="absolute bottom-2 left-4 flex items-center gap-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                            <button onClick={() => handleRegenerate('A')} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors bg-white shadow-sm border border-slate-100" title="Regenerate"><RotateCcw className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleDelete('A', assistantMsgA.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors bg-white shadow-sm border border-slate-100" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                          <div className="absolute bottom-2.5 right-4 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                            {(isLast && isLoadingA ? totalDurationA : messageStats[assistantMsgA.id]?.duration) > 0 && (
                              <>
                                <span>{(isLast && isLoadingA ? totalDurationA : messageStats[assistantMsgA.id]?.duration).toFixed(1)}s</span>
                                <span className="w-px h-2 bg-slate-200" />
                              </>
                            )}
                            <span>{estimateTextTokens(assistantMsgA.content)} tokens</span>
                            {(isLast && isLoadingA ? tokensPerSecondA : messageStats[assistantMsgA.id]?.tps) > 0 && (
                              <>
                                <span className="w-px h-2 bg-slate-200" />
                                <span className="text-blue-500">{formatTokenRate(isLast && isLoadingA ? tokensPerSecondA : messageStats[assistantMsgA.id]?.tps)} tok/s</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isLast && isLoadingA ? (
                      <div className="animate-pulse min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm min-w-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo model={modelAConfig} size="sm" className="h-6 w-6 rounded-lg text-[10px]" />
                            <span className="text-[11px] font-semibold text-blue-600 truncate block">
                              {modelAConfig?.name || modelAConfig?.modelId || 'Model A'}
                            </span>
                          </div>
                          <MessageRenderer content="" isLoading={true} markdownClassName={markdownClassName} />
                        </div>
                      </div>
                    ) : isLast && errorA ? (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-700 text-xs animate-in zoom-in-95 duration-200">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold mb-1">Error with Model A</p>
                          <p className="leading-relaxed opacity-90">{errorA}</p>
                        </div>
                        <button onClick={() => setErrorA(null)} className="p-1 hover:bg-red-100 rounded-md transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4 min-w-0">
                    {assistantMsgB ? (
                      <div className="group/msg relative animate-in slide-in-from-bottom-2 duration-300 min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed shadow-sm text-slate-700 min-w-0 overflow-hidden pb-10">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo model={modelBConfig} size="sm" className="h-6 w-6 rounded-lg text-[10px]" />
                            <span className="text-[11px] font-semibold text-purple-600 truncate block">
                              {modelBConfig?.name || modelBConfig?.modelId || 'Model B'}
                            </span>
                          </div>
                          <MessageRenderer content={assistantMsgB.content} isLoading={isLast && isLoadingB} markdownClassName={markdownClassName} />
                          <div className="absolute bottom-2 left-4 flex items-center gap-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                            <button onClick={() => handleRegenerate('B')} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors bg-white shadow-sm border border-slate-100" title="Regenerate"><RotateCcw className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleDelete('B', assistantMsgB.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors bg-white shadow-sm border border-slate-100" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                          <div className="absolute bottom-2.5 right-4 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                            {(isLast && isLoadingB ? totalDurationB : messageStats[assistantMsgB.id]?.duration) > 0 && (
                              <>
                                <span>{(isLast && isLoadingB ? totalDurationB : messageStats[assistantMsgB.id]?.duration).toFixed(1)}s</span>
                                <span className="w-px h-2 bg-slate-200" />
                              </>
                            )}
                            <span>{estimateTextTokens(assistantMsgB.content)} tokens</span>
                            {(isLast && isLoadingB ? tokensPerSecondB : messageStats[assistantMsgB.id]?.tps) > 0 && (
                              <>
                                <span className="w-px h-2 bg-slate-200" />
                                <span className="text-purple-500">{formatTokenRate(isLast && isLoadingB ? tokensPerSecondB : messageStats[assistantMsgB.id]?.tps)} tok/s</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isLast && isLoadingB ? (
                      <div className="animate-pulse min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm min-w-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo model={modelBConfig} size="sm" className="h-6 w-6 rounded-lg text-[10px]" />
                            <span className="text-[11px] font-semibold text-purple-600 truncate block">
                              {modelBConfig?.name || modelBConfig?.modelId || 'Model B'}
                            </span>
                          </div>
                          <MessageRenderer content="" isLoading={true} markdownClassName={markdownClassName} />
                        </div>
                      </div>
                    ) : isLast && errorB ? (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-700 text-xs animate-in zoom-in-95 duration-200">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold mb-1">Error with Model B</p>
                          <p className="leading-relaxed opacity-90">{errorB}</p>
                        </div>
                        <button onClick={() => setErrorB(null)} className="p-1 hover:bg-red-100 rounded-md transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const singleContent = (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div className="h-full flex">
        <div className="flex-1 min-w-0 flex flex-col">
          {errorA && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">Model Error</p>
                <p className="text-xs text-red-600 mt-1">{errorA}</p>
              </div>
              <button
                onClick={() => setErrorA(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-6 pb-32">
            <div className="max-w-4xl mx-auto space-y-6 py-8">
              {assistantMessagesA.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                  <div className="p-4 rounded-2xl mb-4 bg-blue-50">
                    <Bot className="h-12 w-12 text-blue-200" />
                  </div>
                  <p className="font-medium">Ready to chat</p>
                </div>
              )}

              {messagesA.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  } animate-in slide-in-from-bottom-2 duration-300`}
                >
                  {message.role === 'user' ? (
                    <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center shadow-sm border border-white bg-slate-800 text-white">
                      <User className="h-5 w-5" />
                    </div>
                  ) : (
                    <ModelLogo
                      model={modelAConfig}
                      className="rounded-full border-white shadow-sm"
                    />
                  )}
                  <div
                    className={`max-w-[85%] min-w-0 overflow-hidden rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                      message.role === 'user'
                        ? 'bg-slate-800 text-white rounded-tr-none'
                        : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <div className={markdownClassName}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <MessageRenderer
                        content={message.content}
                        isLoading={isLoadingA && message.id === messagesA[messagesA.length - 1].id}
                        markdownClassName={markdownClassName}
                      />
                    )}
                  </div>
                </div>
              ))}

              {isLoadingA && !messagesA.some(m => m.role === 'assistant' && m.id === messagesA[messagesA.length - 1].id) && (
                <div className="flex gap-4 animate-pulse">
                  <ModelLogo model={modelAConfig} />
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm">
                    <div className="flex space-x-1.5 h-5 items-center">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 relative overflow-hidden">
      {activeView === 'comparison' ? comparisonContent : singleContent}

      <InputArea
        disabled={!canSend}
        disabledHint={disabledHint}
        isLoading={isLoading}
        onSend={handleSend}
          placeholder={inputPlaceholder}
        />
    </div>
  );
}
