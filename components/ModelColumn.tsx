
import React from 'react';
import { Bot, User } from 'lucide-react';
import { Message } from 'ai/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppConfig } from '@/lib/types';

interface ModelColumnProps {
    modelName: string;
    messages: Message[];
    isLoading: boolean;
    color: 'blue' | 'purple';
    isComparison?: boolean;
    side?: 'A' | 'B';
    config?: AppConfig;
    setConfig?: (config: AppConfig) => void;
    modelId?: string; // Add modelId prop to display
    userMessages?: Message[]; // User messages for comparison view (displayed in center)
}

export function ModelColumn({ messages, isLoading, color, isComparison = false, userMessages }: ModelColumnProps) {
    const isBlue = color === 'blue';
    const bgColor = isBlue ? 'bg-slate-50/50' : 'bg-slate-50/50'; // Keep background neutral
    const accentColor = isBlue ? 'text-blue-600' : 'text-purple-600';
    return (
        <div className={`flex flex-col h-full ${bgColor}`}>
            <div className="flex-1 overflow-y-auto px-4 pb-32 scroll-smooth">
                <div className="max-w-8xl mx-auto space-y-8">
                    {messages.length === 0 && !userMessages?.length && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 animate-in fade-in zoom-in duration-500">
                            <div className={`p-4 rounded-2xl mb-4 ${isBlue ? 'bg-blue-50' : 'bg-purple-50'}`}>
                                <Bot className={`h-12 w-12 ${isBlue ? 'text-blue-200' : 'text-purple-200'}`} />
                            </div>
                            <p className="font-medium">Ready to compare</p>
                        </div>
                    )}

                    {/* In comparison mode, only show assistant messages (user messages shown in center) */}
                    {isComparison && userMessages ? (
                        userMessages.map((userMsg, index) => {
                        const assistantMsg = messages[index]; // Get corresponding assistant message by index
                        
                        return (
                            <div key={`response-${userMsg.id}`} className="space-y-4">
                                {/* Assistant response */}
                                {assistantMsg && assistantMsg.role === 'assistant' ? (
                                    <div className="flex gap-4 animate-in slide-in-from-bottom-2 duration-300">
                                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center shadow-sm border border-white bg-white`}>
                                            <Bot className={`h-6 w-6 ${accentColor}`} />
                                        </div>
                                        <div className={`max-w-[85%] rounded-2xl rounded-tl-none px-5 py-3.5 text-sm leading-relaxed shadow-sm bg-white border border-slate-100 text-slate-700`}>
                                            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-50 prose-img:rounded-lg prose-img:shadow-md">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {assistantMsg.content}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                ) : index === userMessages.length - 1 && isLoading ? (
                                    // Show loading indicator for the last user message if loading
                                    <div className="flex gap-4 animate-pulse">
                                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-white border border-slate-100 shadow-sm`}>
                                            <Bot className={`h-6 w-6 ${accentColor}`} />
                                        </div>
                                        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm">
                                            <div className="flex space-x-1.5 h-5 items-center">
                                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                        })
                    ) : (
                        messages.map((m) => (
                            <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''} animate-in slide-in-from-bottom-2 duration-300`}>
                                <div
                                    className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center shadow-sm border border-white ${m.role === 'user'
                                        ? 'bg-slate-800 text-white'
                                        : 'bg-white'
                                        }`}
                                >
                                    {m.role === 'user' ? <User className="h-5 w-5" /> : <Bot className={`h-6 w-6 ${accentColor}`} />}
                                </div>

                                <div
                                    className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${m.role === 'user'
                                        ? 'bg-slate-800 text-white rounded-tr-none'
                                        : `bg-white border border-slate-100 text-slate-700 rounded-tl-none`
                                        }`}
                                >
                                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-50 prose-img:rounded-lg prose-img:shadow-md">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {m.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}

                    {isLoading && (
                        <div className="flex gap-4 animate-pulse">
                            <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-white border border-slate-100 shadow-sm`}>
                                <Bot className={`h-6 w-6 ${accentColor}`} />
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm">
                                <div className="flex space-x-1.5 h-5 items-center">
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
