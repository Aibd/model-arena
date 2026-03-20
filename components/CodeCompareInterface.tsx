'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { useSession } from 'next-auth/react';
import { getClientErrorMessage } from '@/lib/client-errors';
import { estimateTextTokens, formatTokenRate } from '@/lib/token-metrics';
import { AppConfig, ChatSession } from '@/lib/types';
import { AlertCircle, X, Maximize2, Minimize2, Copy, Eye, Code, Trash2, RotateCcw } from 'lucide-react';
import { InputArea } from './InputArea';

interface CodeCompareInterfaceProps {
    config: AppConfig;
    loadedSession?: ChatSession | null;
    leftMode: PanelMode;
    setLeftMode: React.Dispatch<React.SetStateAction<PanelMode>>;
    rightMode: PanelMode;
    setRightMode: React.Dispatch<React.SetStateAction<PanelMode>>;
}

type PanelMode = 'code' | 'preview';
const CODE_COMPARE_DRAFT_STORAGE_KEY = 'model-arena:code-compare-draft';
const PREVIEW_BACKGROUND = '#ffffff';
const THINKING_BLOCK_PATTERNS = [
    /<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi,
    /<thinking\b[^>]*>[\s\S]*?(?:<\/thinking>|$)/gi,
    /<reasoning\b[^>]*>[\s\S]*?(?:<\/reasoning>|$)/gi,
    /```(?:think|thinking|reasoning)[^\n]*\n[\s\S]*?(?:```|$)/gi,
];
const PREVIEW_DOCUMENT_RESET = `
    html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100%;
        min-height: 100%;
        background: ${PREVIEW_BACKGROUND} !important;
        color-scheme: light;
    }
    body {
        cursor: default;
    }
    body > div:only-child,
    body > main:only-child,
    body > section:only-child {
        width: 100%;
        min-height: 100%;
    }
`;
const PREVIEW_DOCUMENT_RESET_STYLE = `<style id="arena-preview-reset">${PREVIEW_DOCUMENT_RESET}</style>`;

type StoredCodeCompareDraft = {
    leftCode: string;
    rightCode: string;
};

function readStoredCodeCompareDraft(): StoredCodeCompareDraft {
    if (typeof window === 'undefined') {
        return { leftCode: '', rightCode: '' };
    }

    try {
        const raw = window.localStorage.getItem(CODE_COMPARE_DRAFT_STORAGE_KEY);
        if (!raw) {
            return { leftCode: '', rightCode: '' };
        }

        const parsed = JSON.parse(raw) as Partial<StoredCodeCompareDraft>;
        return {
            leftCode: typeof parsed.leftCode === 'string' ? parsed.leftCode : '',
            rightCode: typeof parsed.rightCode === 'string' ? parsed.rightCode : '',
        };
    } catch {
        return { leftCode: '', rightCode: '' };
    }
}

function injectPreviewDocumentReset(documentContent: string): string {
    if (/<head[\s>]/i.test(documentContent)) {
        return documentContent.replace(
            /<head(\s[^>]*)?>/i,
            (match) => `${match}${PREVIEW_DOCUMENT_RESET_STYLE}`,
        );
    }

    if (/<html[\s>]/i.test(documentContent)) {
        return documentContent.replace(
            /<html(\s[^>]*)?>/i,
            (match) => `${match}<head>${PREVIEW_DOCUMENT_RESET_STYLE}</head>`,
        );
    }

    return `
        <html>
            <head>${PREVIEW_DOCUMENT_RESET_STYLE}</head>
            <body>${documentContent}</body>
        </html>
    `;
}

function stripThinkingBlocks(content: string): string {
    return THINKING_BLOCK_PATTERNS.reduce(
        (result, pattern) => result.replace(pattern, ''),
        content,
    ).trim();
}

function normalizeCodeContent(content: string | undefined): string {
    if (!content) {
        return '';
    }

    const lines = stripThinkingBlocks(content).split('\n');
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('```');
    });

    return filtered.join('\n').trim();
}

export function CodeCompareInterface({ 
    config, 
    loadedSession,
    leftMode, 
    setLeftMode, 
    rightMode, 
    setRightMode 
}: CodeCompareInterfaceProps) {
    const { status } = useSession();
    const [errorA, setErrorA] = useState<string | null>(null);
    const [errorB, setErrorB] = useState<string | null>(null);
    const [tokensPerSecondA, setTokensPerSecondA] = useState(0);
    const [tokensPerSecondB, setTokensPerSecondB] = useState(0);
    const [totalDurationA, setTotalDurationA] = useState(0);
    const [totalDurationB, setTotalDurationB] = useState(0);
    const [isSessionSyncing, setIsSessionSyncing] = useState(true);

    const [leftFullscreen, setLeftFullscreen] = useState(false);
    const [rightFullscreen, setRightFullscreen] = useState(false);
    const [leftCode, setLeftCode] = useState(() => readStoredCodeCompareDraft().leftCode);
    const [rightCode, setRightCode] = useState(() => readStoredCodeCompareDraft().rightCode);
    const [sessionSeed] = useState(() => ({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
    }));
    const saveTimeoutRef = useRef<number | null>(null);
    const contentScrollRef = useRef<HTMLDivElement | null>(null);
    const streamStatsARef = useRef<{ baselineTokens: number; startedAt: number }>({
        baselineTokens: 0,
        startedAt: 0,
    });
    const streamStatsBRef = useRef<{ baselineTokens: number; startedAt: number }>({
        baselineTokens: 0,
        startedAt: 0,
    });

    const getModel = (id: string) => config.models.find(m => m.id === id);

    const modelAConfig = getModel(config.comparison.modelAId);
    const modelBConfig = getModel(config.comparison.modelBId);

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
        id: `code-chat-${modelAConfig?.id || 'a'}`,
        onFinish: () => {
            setErrorA(null);
            setLeftMode((prev) => (prev === 'code' ? 'preview' : prev));
        },
        onError: async (err: unknown) => {
            setErrorA(
                await getClientErrorMessage(
                    err,
                    'Request failed, please check API configuration',
                ),
            );
        },
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
        id: `code-chat-${modelBConfig?.id || 'b'}`,
        onFinish: () => {
            setErrorB(null);
            setRightMode((prev) => (prev === 'code' ? 'preview' : prev));
        },
        onError: async (err: unknown) => {
            setErrorB(
                await getClientErrorMessage(
                    err,
                    'Request failed, please check API configuration',
                ),
            );
        },
    });

    useEffect(() => {
        let timerId: number | null = null;
        
        // Use a microtask or next tick to avoid cascading renders
        const syncSession = () => {
            setIsSessionSyncing(true);

            if (!loadedSession || loadedSession.type !== 'code') {
                setMessagesA([]);
                setMessagesB([]);
                timerId = window.setTimeout(() => {
                    setIsSessionSyncing(false);
                }, 0);
                return;
            }

            setMessagesA(loadedSession.messagesA || []);
            setMessagesB(loadedSession.messagesB || []);
            setLeftCode('');
            setRightCode('');
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

    const handleSend = async (message: string) => {
        // Clear existing edited code when sending a new request
        setLeftCode('');
        setRightCode('');
        setTokensPerSecondA(0);
        setTokensPerSecondB(0);
        setTotalDurationA(0);
        setTotalDurationB(0);
        streamStatsARef.current.startedAt = 0;
        streamStatsARef.current.baselineTokens = totalAssistantTokensA;
        streamStatsBRef.current.startedAt = 0;
        streamStatsBRef.current.baselineTokens = totalAssistantTokensB;

        const msg = { role: 'user' as const, content: message };
        await Promise.all([
            appendA(msg),
            appendB(msg),
        ]);
    };

    const handleClearPanel = (side: 'A' | 'B') => {
        if (side === 'A') {
            setLeftCode('');
            setMessagesA([]);
            setErrorA(null);
            setLeftMode('code');
            return;
        }

        setRightCode('');
        setMessagesB([]);
        setErrorB(null);
        setRightMode('code');
    };

    const handleRegeneratePanel = async (side: 'A' | 'B') => {
        if (side === 'A') {
            if (isLoadingA) {
                return;
            }
            setLeftCode('');
            setTotalDurationA(0);
            await reloadA();
            return;
        }

        if (isLoadingB) {
            return;
        }
        setRightCode('');
        setTotalDurationB(0);
        await reloadB();
    };

    const assistantMessagesA = messagesA.filter(m => m.role === 'assistant');
    const assistantMessagesB = messagesB.filter(m => m.role === 'assistant');
    const totalAssistantTokensA = estimateTextTokens(
        assistantMessagesA
            .map((message) => stripThinkingBlocks(message.content))
            .join('\n'),
    );
    const totalAssistantTokensB = estimateTextTokens(
        assistantMessagesB
            .map((message) => stripThinkingBlocks(message.content))
            .join('\n'),
    );

    const lastAssistantA = assistantMessagesA[assistantMessagesA.length - 1];
    const lastAssistantB = assistantMessagesB[assistantMessagesB.length - 1];

    const normalizedContentA = normalizeCodeContent(lastAssistantA?.content as string | undefined);
    const normalizedContentB = normalizeCodeContent(lastAssistantB?.content as string | undefined);

    const isLoading = isLoadingA || isLoadingB;
    const sessionId = loadedSession?.id || sessionSeed.id;
    const createdAt = loadedSession?.createdAt || sessionSeed.createdAt;
    const isImmersivePreview = leftMode === 'preview' && rightMode === 'preview';

    useEffect(() => {
        if (isLoadingA) {
            if (streamStatsARef.current.startedAt === 0) {
                streamStatsARef.current.startedAt = Date.now();
                streamStatsARef.current.baselineTokens = totalAssistantTokensA;
                // Defer state update to avoid cascading renders
                window.setTimeout(() => setTokensPerSecondA(0), 0);
                return;
            }

            const elapsedSeconds = Math.max(
                (Date.now() - streamStatsARef.current.startedAt) / 1000,
                0.001,
            );
            const generatedTokens = Math.max(
                totalAssistantTokensA - streamStatsARef.current.baselineTokens,
                0,
            );
            setTotalDurationA(elapsedSeconds);
            setTokensPerSecondA(generatedTokens / elapsedSeconds);
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
            setTotalDurationA(elapsedSeconds);
            setTokensPerSecondA(generatedTokens / elapsedSeconds);
        }
        streamStatsARef.current.startedAt = 0;
        streamStatsARef.current.baselineTokens = totalAssistantTokensA;
    }, [isLoadingA, totalAssistantTokensA]);

    useEffect(() => {
        if (isLoadingB) {
            if (streamStatsBRef.current.startedAt === 0) {
                streamStatsBRef.current.startedAt = Date.now();
                streamStatsBRef.current.baselineTokens = totalAssistantTokensB;
                // Defer state update to avoid cascading renders
                window.setTimeout(() => setTokensPerSecondB(0), 0);
                return;
            }

            const elapsedSeconds = Math.max(
                (Date.now() - streamStatsBRef.current.startedAt) / 1000,
                0.001,
            );
            const generatedTokens = Math.max(
                totalAssistantTokensB - streamStatsBRef.current.baselineTokens,
                0,
            );
            setTotalDurationB(elapsedSeconds);
            setTokensPerSecondB(generatedTokens / elapsedSeconds);
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
            setTotalDurationB(elapsedSeconds);
            setTokensPerSecondB(generatedTokens / elapsedSeconds);
        }
        streamStatsBRef.current.startedAt = 0;
        streamStatsBRef.current.baselineTokens = totalAssistantTokensB;
    }, [isLoadingB, totalAssistantTokensB]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(
            CODE_COMPARE_DRAFT_STORAGE_KEY,
            JSON.stringify({ leftCode, rightCode }),
        );
    }, [leftCode, rightCode]);

    useEffect(() => {
        if (!isLoading) {
            return;
        }

        const container = contentScrollRef.current;
        if (!container) {
            return;
        }

        container.scrollTop = container.scrollHeight;
    }, [isLoading, messagesA, messagesB]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

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

        const firstUserMessage = messagesA.find((message) => message.role === 'user');
        const rawTitle = firstUserMessage?.content || '';
        const title =
            rawTitle.length > 60
                ? `Code: ${rawTitle.slice(0, 54)}...`
                : rawTitle
                    ? `Code: ${rawTitle}`
                    : 'Code comparison';

        const payload: ChatSession = {
            id: sessionId,
            title,
            createdAt,
            type: 'code',
            modelAId: modelAConfig?.id || '',
            modelBId: modelBConfig?.id || undefined,
            messagesA,
            messagesB,
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
        createdAt,
        isLoading,
        isSessionSyncing,
        messagesA,
        messagesB,
        modelAConfig?.id,
        modelBConfig?.id,
        sessionId,
        status,
    ]);

    const renderCode = (value: string, onChange: (v: string) => void) => {
        return (
            <div className="h-full w-full bg-slate-900 text-slate-50 text-xs rounded-xl overflow-hidden">
                <textarea
                    className="h-full w-full resize-none bg-slate-900 text-slate-50 text-xs p-4 font-mono outline-none border-0"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Paste or edit code here..."
                />
            </div>
        );
    };

    const renderPreview = (content: string | undefined) => {
        if (!content) {
            return (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    No preview content available
                </div>
            );
        }

        const trimmedContent = content.trim();
        const isSvg = trimmedContent.startsWith('<svg') || trimmedContent.startsWith('<?xml');
        const isStandaloneMedia = /^<(img|canvas)\b/i.test(trimmedContent);
        const isFullDocument =
            /<!doctype html/i.test(trimmedContent) ||
            /<html[\s>]/i.test(trimmedContent) ||
            /<head[\s>]/i.test(trimmedContent) ||
            /<body[\s>]/i.test(trimmedContent);

        const wrappedContent = isSvg
            ? `
                <html>
                    <head>
                        <style>
                            html, body {
                                margin: 0;
                                padding: 0;
                                width: 100%;
                                height: 100%;
                                overflow: hidden;
                                background: ${PREVIEW_BACKGROUND};
                            }
                            body {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                cursor: default;
                            }
                            svg {
                                display: block;
                                width: 100% !important;
                                height: 100% !important;
                                max-width: 100%;
                                max-height: 100%;
                            }
                        </style>
                    </head>
                    <body>${content}
                        <script>
                            (function () {
                                const fitSvg = () => {
                                    const svg = document.querySelector('svg');
                                    if (!svg || typeof svg.getBBox !== 'function') return;
                                    try {
                                        const box = svg.getBBox();
                                        if (!isFinite(box.x) || !isFinite(box.y) || box.width <= 0 || box.height <= 0) return;
                                        const pad = Math.max(box.width, box.height) * 0.005;
                                        svg.setAttribute('viewBox', [
                                            box.x - pad,
                                            box.y - pad,
                                            box.width + pad * 2,
                                            box.height + pad * 2,
                                        ].join(' '));
                                        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                                        svg.style.width = '100%';
                                        svg.style.height = '100%';
                                    } catch (_) {}
                                };
                                window.addEventListener('load', fitSvg, { once: true });
                                requestAnimationFrame(fitSvg);
                                setTimeout(fitSvg, 50);
                            })();
                        </script>
                    </body>
                </html>
            `
            : isStandaloneMedia
                ? `
                    <html>
                        <head>
                            <style>
                                html, body {
                                    margin: 0;
                                    padding: 0;
                                    width: 100%;
                                    height: 100%;
                                    overflow: hidden;
                                    background: ${PREVIEW_BACKGROUND};
                                }
                                body {
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    cursor: default;
                                }
                                body > img,
                                body > canvas {
                                    display: block;
                                    width: 100% !important;
                                    height: 100% !important;
                                    max-width: 100% !important;
                                    max-height: 100% !important;
                                    object-fit: contain;
                                }
                            </style>
                        </head>
                        <body>${content}</body>
                    </html>
                `
                : isFullDocument
                    ? injectPreviewDocumentReset(trimmedContent)
            : `
                <html>
                    <head>
                        <style>
                            html, body {
                                margin: 0;
                                padding: 0;
                                width: 100%;
                                min-height: 100%;
                                background: ${PREVIEW_BACKGROUND} !important;
                                color-scheme: light;
                            }
                            body {
                                cursor: default;
                                overflow: auto;
                            }
                            body > img:only-child,
                            body > canvas:only-child,
                            body > iframe:only-child {
                                display: block;
                                width: 100% !important;
                                height: 100% !important;
                                max-width: 100% !important;
                                max-height: 100% !important;
                                object-fit: contain;
                            }
                            body > div:only-child,
                            body > main:only-child,
                            body > section:only-child {
                                width: 100%;
                                min-height: 100%;
                            }
                        </style>
                    </head>
                    <body>${content}
                        <script>
                            (function () {
                                const svg = document.querySelector('svg');
                                if (!svg || typeof svg.getBBox !== 'function') return;
                                try {
                                    const box = svg.getBBox();
                                    if (!isFinite(box.x) || !isFinite(box.y) || box.width <= 0 || box.height <= 0) return;
                                    const pad = Math.max(box.width, box.height) * 0.005;
                                    svg.setAttribute('viewBox', [
                                        box.x - pad,
                                        box.y - pad,
                                        box.width + pad * 2,
                                        box.height + pad * 2,
                                    ].join(' '));
                                    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                                    svg.style.width = '100%';
                                    svg.style.height = '100%';
                                } catch (_) {}
                            })();
                        </script>
                    </body>
                </html>
            `;

        return (
            <iframe
                className="w-full h-full border-0 bg-white cursor-default"
                srcDoc={wrappedContent}
                sandbox="allow-scripts"
            />
        );
    };

    const renderPanel = (
        side: 'A' | 'B',
        mode: PanelMode,
        setMode: (m: PanelMode) => void,
        fullscreen: boolean,
        setFullscreen: (v: boolean) => void,
        isLoadingSide: boolean
    ) => {
        const currentCodeValue = side === 'A'
            ? (leftCode || normalizedContentA)
            : (rightCode || normalizedContentB);
        const canvasClassName = mode === 'preview' ? 'bg-white' : 'bg-slate-950';
        const statsClassName = mode === 'preview'
            ? 'border border-slate-200 bg-white/90 text-slate-600'
            : 'border border-white/30 bg-white/35 text-slate-700';

        const panel = (
            <div className="flex flex-col h-full bg-slate-50 group/panel">
                <div className="flex-1 p-0">
                    <div
                        className={`h-full border-y border-slate-200 overflow-hidden relative group/content rounded-none ${canvasClassName}`}
                    >
                        {isLoadingSide && (
                            <div className="absolute top-3 left-3 z-20 text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-white">
                                Generating...
                            </div>
                        )}
                        <div
                            className={`absolute bottom-3 left-auto right-3 z-20 text-[10px] px-2 py-0.5 rounded-full backdrop-blur-md shadow-sm ${statsClassName}`}
                            style={{ left: 'auto', right: '0.75rem' }}
                        >
                            {side === 'A'
                                ? `${totalDurationA.toFixed(1)}s | ${totalAssistantTokensA} tok | ${formatTokenRate(tokensPerSecondA)} tok/s`
                                : `${totalDurationB.toFixed(1)}s | ${totalAssistantTokensB} tok | ${formatTokenRate(tokensPerSecondB)} tok/s`}
                        </div>
                        
                        {/* Hover Overlay Controls */}
                        <div className="absolute top-0 left-0 right-0 p-3 flex items-start justify-end z-10 opacity-0 group-hover/panel:opacity-100 transition-all duration-200 pointer-events-none">
                            <div className="flex items-center gap-1.5 pointer-events-auto">
                                <div className="flex items-center gap-1 p-1 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg mr-1">
                                    <button
                                        type="button"
                                        onClick={() => setMode('code')}
                                        className={`p-1.5 rounded-md transition-all ${
                                            mode === 'code' 
                                                ? 'bg-blue-50 text-blue-600' 
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                        title="Code Mode"
                                    >
                                        <Code className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('preview')}
                                        className={`p-1.5 rounded-md transition-all ${
                                            mode === 'preview' 
                                                ? 'bg-blue-50 text-blue-600' 
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                        title="Preview Mode"
                                    >
                                        <Eye className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                {mode === 'code' && currentCodeValue && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(currentCodeValue);
                                            } catch (e) {
                                                console.error('Copy failed', e);
                                            }
                                        }}
                                        className="p-2 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 text-slate-600 hover:bg-white hover:text-blue-600 transition-all shadow-lg hover:scale-105 active:scale-95"
                                        title="Copy code"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleRegeneratePanel(side).catch((error) => {
                                            console.error('Regenerate failed', error);
                                        });
                                    }}
                                    disabled={isLoadingSide}
                                    className="p-2 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 text-slate-600 hover:bg-white hover:text-emerald-600 transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:text-slate-600"
                                    title={side === 'A' ? 'Regenerate left panel' : 'Regenerate right panel'}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleClearPanel(side)}
                                    className="p-2 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 text-slate-600 hover:bg-white hover:text-red-600 transition-all shadow-lg hover:scale-105 active:scale-95"
                                    title={side === 'A' ? 'Clear left panel' : 'Clear right panel'}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFullscreen(!fullscreen)}
                                    className="p-2 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 text-slate-600 hover:bg-white hover:text-blue-600 transition-all shadow-lg hover:scale-105 active:scale-95"
                                    title="Fullscreen Preview"
                                >
                                    {fullscreen ? (
                                        <Minimize2 className="h-4 w-4" />
                                    ) : (
                                        <Maximize2 className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="h-full">
                            {mode === 'code'
                                ? renderCode(
                                    currentCodeValue,
                                    side === 'A' ? setLeftCode : setRightCode
                                )
                                : renderPreview(currentCodeValue)}
                        </div>
                    </div>
                </div>
            </div>
        );

        if (!fullscreen) {
            return panel;
        }

        return (
            <>
                {panel}
                <div className="fixed inset-0 z-[100] bg-white group/fullscreen">
                    <button
                        type="button"
                        onClick={() => setFullscreen(false)}
                        className="absolute top-4 right-4 z-[110] p-2.5 rounded-full bg-slate-900/10 hover:bg-slate-900/20 text-slate-600 hover:text-slate-900 transition-all opacity-0 group-hover/fullscreen:opacity-100 backdrop-blur-sm border border-white/20"
                        title="Exit Fullscreen"
                    >
                        <Minimize2 className="h-5 w-5" />
                    </button>
                    <div className="w-full h-full">
                        {renderPreview(currentCodeValue)}
                    </div>
                </div>
            </>
        );
    };

    const canSend =
        status === 'authenticated' && Boolean(modelAConfig) && Boolean(modelBConfig);
    const inputPlaceholder =
        status !== 'authenticated'
            ? 'Sign in to configure models and start comparing.'
            : !modelAConfig || !modelBConfig
                ? 'Select both models to start code comparison.'
                : 'Ask for code, UI, or a runnable snippet...';
    const disabledHint =
        status !== 'authenticated'
            ? 'Guest mode is read-only. Sign in to save settings and run comparisons.'
            : !modelAConfig || !modelBConfig
                ? 'Choose both models before sending a prompt.'
                : undefined;
    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {errorA && (
                <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800">
                            {modelAConfig?.name || modelAConfig?.modelId || 'Model A'} Error
                        </p>
                        <p className="text-xs text-red-600 mt-1">{errorA}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setErrorA(null)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
            {errorB && (
                <div className="mx-6 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800">
                            {modelBConfig?.name || modelBConfig?.modelId || 'Model B'} Error
                        </p>
                        <p className="text-xs text-red-600 mt-1">{errorB}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setErrorB(null)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div
                ref={contentScrollRef}
                className={`flex-1 flex overflow-y-auto mt-0 pr-0 ${
                    isImmersivePreview ? 'pb-2' : 'pb-20'
                }`}
            >
                <div className="flex flex-1 min-w-0 divide-x divide-slate-200">
                <div className="flex-1 min-w-0 flex flex-col">
                    {renderPanel(
                        'A',
                        leftMode,
                        setLeftMode,
                        leftFullscreen,
                        setLeftFullscreen,
                        isLoadingA
                    )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    {renderPanel(
                        'B',
                        rightMode,
                        setRightMode,
                        rightFullscreen,
                        setRightFullscreen,
                        isLoadingB
                    )}
                </div>
                </div>
            </div>

            {!isImmersivePreview && (
                <InputArea
                    disabled={!canSend}
                    disabledHint={disabledHint}
                    onSend={handleSend}
                    isLoading={isLoading}
                    placeholder={inputPlaceholder}
                />
            )}
        </div>
    );
}
