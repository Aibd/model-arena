import React, { useEffect, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { useSession } from 'next-auth/react';
import { AlertCircle, Bot, Check, Copy, User, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ModelLogo } from '@/components/ModelLogo';
import { getClientErrorMessage } from '@/lib/client-errors';
import { estimateTextTokens } from '@/lib/token-metrics';
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

export function ChatInterface({
  activeView,
  config,
  loadedSession,
}: ChatInterfaceProps) {
  const { status } = useSession();
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [isSessionSyncing, setIsSessionSyncing] = useState(true);
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

  useEffect(() => {
    if (isLoadingA) {
      if (streamStatsARef.current.startedAt === 0) {
        streamStatsARef.current.startedAt = Date.now();
        streamStatsARef.current.baselineTokens = totalAssistantTokensA;
        return;
      }
      return;
    }

    streamStatsARef.current.startedAt = 0;
    streamStatsARef.current.baselineTokens = totalAssistantTokensA;
  }, [isLoadingA, totalAssistantTokensA]);

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
        return;
      }
      return;
    }

    streamStatsBRef.current.startedAt = 0;
    streamStatsBRef.current.baselineTokens = totalAssistantTokensB;
  }, [activeView, isLoadingB, totalAssistantTokensB]);

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
        {errorA && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Model A Error</p>
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
        {errorB && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Model B Error</p>
              <p className="text-xs text-red-600 mt-1">{errorB}</p>
            </div>
            <button
              onClick={() => setErrorB(null)}
              className="text-red-400 hover:text-red-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mx-auto w-full px-6 py-8 md:px-8 lg:px-10 space-y-7">
          {userMessages.length === 0 && messagesA.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
              <div className="p-4 rounded-2xl mb-4 bg-blue-50">
                <Bot className="h-12 w-12 text-blue-200" />
              </div>
              <p className="font-medium">Ready to compare</p>
            </div>
          )}

          {userMessages.map((userMessage, index) => {
            const assistantMessageA = assistantMessagesA[index];
            const assistantMessageB = assistantMessagesB[index];
            const isLastPair = index === userMessages.length - 1;

            return (
              <div key={userMessage.id} className="space-y-4">
                <div className="flex justify-end">
                  <div className="max-w-[78%] animate-in slide-in-from-bottom-2 duration-300 min-w-0">
                    <div className="bg-slate-800 text-white rounded-2xl rounded-tr-none px-5 py-3.5 text-sm leading-relaxed shadow-sm min-w-0 overflow-hidden">
                      <div className={markdownClassName}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {userMessage.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                  <div className="space-y-4 min-w-0">
                    {assistantMessageA ? (
                      <div className="animate-in slide-in-from-bottom-2 duration-300 min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed shadow-sm text-slate-700 min-w-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo
                              model={modelAConfig}
                              size="sm"
                              className="h-6 w-6 rounded-lg text-[10px]"
                            />
                            <span className="text-[11px] font-semibold text-blue-600 truncate block">
                              {modelAConfig?.name || modelAConfig?.modelId || 'Model A'}
                            </span>
                          </div>
                          <div className={markdownClassName}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {assistantMessageA.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ) : isLastPair && isLoadingA ? (
                      <div className="animate-pulse min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm min-w-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo
                              model={modelAConfig}
                              size="sm"
                              className="h-6 w-6 rounded-lg text-[10px]"
                            />
                            <span className="text-[11px] font-semibold text-blue-600 truncate block">
                              {modelAConfig?.name || modelAConfig?.modelId || 'Model A'}
                            </span>
                          </div>
                          <div className="flex space-x-1.5 h-5 items-center">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4 min-w-0">
                    {assistantMessageB ? (
                      <div className="animate-in slide-in-from-bottom-2 duration-300 min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed shadow-sm text-slate-700 min-w-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo
                              model={modelBConfig}
                              size="sm"
                              className="h-6 w-6 rounded-lg text-[10px]"
                            />
                            <span className="text-[11px] font-semibold text-purple-600 truncate block">
                              {modelBConfig?.name || modelBConfig?.modelId || 'Model B'}
                            </span>
                          </div>
                          <div className={markdownClassName}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {assistantMessageB.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ) : isLastPair && isLoadingB ? (
                      <div className="animate-pulse min-w-0">
                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm min-w-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 min-w-0">
                            <ModelLogo
                              model={modelBConfig}
                              size="sm"
                              className="h-6 w-6 rounded-lg text-[10px]"
                            />
                            <span className="text-[11px] font-semibold text-purple-600 truncate block">
                              {modelBConfig?.name || modelBConfig?.modelId || 'Model B'}
                            </span>
                          </div>
                          <div className="flex space-x-1.5 h-5 items-center">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
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
                    <div className={markdownClassName}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}

              {isLoadingA && (
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
