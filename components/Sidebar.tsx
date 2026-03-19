import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import {
  LogIn,
  LogOut,
  MoreVertical,
  Plus,
  Search,
  ScrollText,
  Settings,
  Trash2,
} from 'lucide-react';

import { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

import { SettingsModal } from './SettingsModal';

interface SidebarProps {
  config: AppConfig;
  isOpen: boolean;
  onNewChat: () => void;
  onSelectHistory: (sessionId: string) => void;
  setConfig: (config: AppConfig) => void;
}

type HistoryItem = { createdAt: number; id: string; title: string; type: string };
type HistoryGroup = {
  createdAt: number;
  id: string;
  title: string;
  type: string;
  sessionIds: string[];
};

function normalizeHistoryTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.。…!！?？]+$/g, '')
    .replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>{}\[\]\\\/]/g, '')
    .trim();
}

export function Sidebar({
  config,
  isOpen,
  onNewChat,
  onSelectHistory,
  setConfig,
}: SidebarProps) {
  const { data: session } = useSession();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [actionMenuSessionId, setActionMenuSessionId] = useState<string | null>(
    null,
  );
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const historyForDisplay = useMemo(() => {
    const seen = new Set<string>();
    const grouped: HistoryGroup[] = [];

    for (const item of history) {
      const normalizedTitle = normalizeHistoryTitle(item.title);
      const key = `${item.type}:${normalizedTitle || item.id}`;
      if (seen.has(key)) {
        const existing = grouped.find(
          (candidate) =>
            `${candidate.type}:${normalizeHistoryTitle(candidate.title) || candidate.id}` ===
            key,
        );
        if (existing) {
          existing.sessionIds.push(item.id);
        }
        continue;
      }
      seen.add(key);
      grouped.push({
        ...item,
        sessionIds: [item.id],
      });
    }

    return grouped;
  }, [history]);
  const filteredHistory = useMemo(() => {
    const keyword = historyQuery.trim().toLowerCase();
    if (!keyword) {
      return historyForDisplay;
    }

    return historyForDisplay.filter((item) =>
      item.title.toLowerCase().includes(keyword),
    );
  }, [historyForDisplay, historyQuery]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) {
        return;
      }

      const items = (await response.json()) as HistoryItem[];
      setHistory(items);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();

    const handleStorageChange = () => {
      loadHistory();
    };

    window.addEventListener('storage-sessions', handleStorageChange);
    return () => {
      window.removeEventListener('storage-sessions', handleStorageChange);
    };
  }, [loadHistory]);

  useEffect(() => {
    if (!actionMenuSessionId) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (
        !target.closest('.history-menu-trigger') &&
        !target.closest('.history-item-menu')
      ) {
        setActionMenuSessionId(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [actionMenuSessionId]);

  const handleSaveConfig = (nextConfig: AppConfig) => {
    setConfig(nextConfig);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig),
    }).catch(() => {});
  };

  const handleDeleteSession = async (group: HistoryGroup) => {
    if (deletingSessionId) {
      return;
    }

    setDeletingSessionId(group.id);
    try {
      const responses: Response[] = [];
      for (const sessionId of group.sessionIds) {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          method: 'DELETE',
        });
        responses.push(response);
      }

      if (responses.some((response) => !response.ok)) {
        throw new Error('Delete failed.');
      }

      setActionMenuSessionId((current) =>
        current === group.id ? null : current,
      );
      await loadHistory();
      window.dispatchEvent(new Event('storage-sessions'));
    } catch (error) {
      console.error('Failed to delete session', error);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const profileLabel =
    session?.user?.name ||
    session?.user?.email ||
    (session ? 'User' : 'Guest');
  const profileInitial = profileLabel.charAt(0).toUpperCase() || 'G';

  return (
    <>
      <div
        className={cn(
          'relative h-full bg-slate-900 text-slate-300 transition-all duration-300 ease-in-out flex-shrink-0 border-r border-slate-800 overflow-hidden',
          isOpen ? 'w-72' : 'w-0',
        )}
      >
        <div className="w-72 h-full flex flex-col">
          <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800/50">
            <div className="flex items-center gap-2 text-white">
              <ScrollText className="h-5 w-5 text-blue-400" />
              <span className="font-bold tracking-wide">Arena Logs</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              title={
                session ? 'Model Settings' : 'Browse settings. Sign in to edit.'
              }
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              <div className="space-y-1">
                <button
                  onClick={onNewChat}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span className="font-medium">New Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryQuery('');
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
                >
                  <Search className="h-4 w-4" />
                  <span className="font-medium">Search</span>
                </button>
                <div className="px-3 pt-1">
                  <input
                    type="text"
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="Search history..."
                    className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <h3 className="px-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Session History
                </h3>
                <div className="space-y-1">
                  {filteredHistory.length === 0 && (
                    <p className="px-3 text-xs text-slate-600 italic">
                      No history found.
                    </p>
                  )}
                  {filteredHistory.map((item) => (
                    <div key={item.id} className="relative group/history-item">
                      <button
                        onClick={() => onSelectHistory(item.id)}
                        className="flex w-full items-center rounded-lg px-3 py-2 pr-10 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all group"
                      >
                        <p className="truncate text-left font-medium w-full">
                          {item.title}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActionMenuSessionId((current) =>
                            current === item.id ? null : item.id,
                          );
                        }}
                        className="history-menu-trigger absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-slate-700/50 hover:text-slate-200 group-hover/history-item:opacity-100"
                        aria-label="Open session actions"
                        title="More"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {actionMenuSessionId === item.id && (
                        <div className="history-item-menu absolute right-2 top-full z-20 mt-1 w-28 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteSession(item);
                            }}
                            disabled={deletingSessionId === item.id}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-800/50 bg-slate-900/50">
            {session ? (
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-xs font-semibold text-white">
                  {profileInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {profileLabel}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {session.user?.email}
                  </p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn('google', { callbackUrl: '/' })}
                className="flex w-full items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 transition-all border border-blue-600/20 hover:border-blue-600/40 group"
              >
                <div className="h-8 w-8 rounded-full bg-blue-600/20 flex items-center justify-center border border-blue-600/30 group-hover:scale-110 transition-transform">
                  <LogIn className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-semibold">
                    Sign In with Google
                  </span>
                  <span className="block text-xs text-blue-300">
                    Save settings and history
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <SettingsModal
        initialConfig={config}
        isOpen={isSettingsOpen}
        isReadOnly={!session}
        onClose={() => setIsSettingsOpen(false)}
        onRequireSignIn={() => signIn('google', { callbackUrl: '/' })}
        onSave={handleSaveConfig}
      />
    </>
  );
}
