'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { Menu, ChevronDown, Code, Eye, Info } from 'lucide-react';

import { ChatInterface } from '@/components/ChatInterface';
import { CodeCompareInterface } from '@/components/CodeCompareInterface';
import { ModelLogo } from '@/components/ModelLogo';
import { Sidebar } from '@/components/Sidebar';
import { AppConfig, ChatSession } from '@/lib/types';

const COMPARISON_SELECTION_STORAGE_KEY = 'model-arena:comparison-selection';
const ARENA_MODE_STORAGE_KEY = 'model-arena:arena-mode';
const DIRECT_MODEL_STORAGE_KEY = 'model-arena:direct-model';
const CODE_COMPARE_DRAFT_STORAGE_KEY = 'model-arena:code-compare-draft';

type ArenaMode = 'direct' | 'side-by-side';

type StoredComparisonSelection = {
  modelAId: string;
  modelBId: string;
};

function readStoredComparisonSelection(): StoredComparisonSelection | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(COMPARISON_SELECTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredComparisonSelection>;
    return {
      modelAId: typeof parsed.modelAId === 'string' ? parsed.modelAId : '',
      modelBId: typeof parsed.modelBId === 'string' ? parsed.modelBId : '',
    };
  } catch {
    return null;
  }
}

function readStoredArenaMode(): ArenaMode | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(ARENA_MODE_STORAGE_KEY);
  return value === 'direct' || value === 'side-by-side' ? value : null;
}

function readStoredDirectModelId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(DIRECT_MODEL_STORAGE_KEY) || '';
}

export default function Home() {
  const { status } = useSession();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mode, setMode] = useState<'chat' | 'code'>('chat');
  const [arenaMode, setArenaMode] = useState<ArenaMode>('side-by-side');
  const [directModelId, setDirectModelId] = useState('');
  const [isArenaModeSelectorOpen, setIsArenaModeSelectorOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState<
    'A' | 'B' | 'Direct' | null
  >(null);
  const [loadedSession, setLoadedSession] = useState<ChatSession | null>(null);
  const [chatResetSeed, setChatResetSeed] = useState(0);
  const [leftMode, setLeftMode] = useState<'code' | 'preview'>('code');
  const [rightMode, setRightMode] = useState<'code' | 'preview'>('code');
  const [config, setConfig] = useState<AppConfig>({
    providerSettings: [],
    models: [],
    comparison: {
      modelAId: '',
      modelBId: '',
    },
  });
  const [configError, setConfigError] = useState<string | null>(null);
  const [hasHydratedStoredComparison, setHasHydratedStoredComparison] =
    useState(false);
  const sortedModels = useMemo(
    () =>
      [...config.models].sort((a, b) => {
        const nameA = (a.name || a.modelId).trim().toLocaleLowerCase();
        const nameB = (b.name || b.modelId).trim().toLocaleLowerCase();
        return nameA.localeCompare(nameB);
      }),
    [config.models],
  );

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setConfigError(null);
        const response = await fetch('/api/config');
        if (!response.ok) {
          throw new Error('Failed to load config.');
        }

        const data: AppConfig = await response.json();
        if (!Array.isArray(data.providerSettings)) {
          data.providerSettings = [];
        }
        if (!Array.isArray(data.models)) {
          data.models = [];
        }
        if (!data.comparison) {
          data.comparison = { modelAId: '', modelBId: '' };
        }

        setConfig(data);
      } catch (error) {
        console.error('Failed to load config', error);
        setConfigError(
          error instanceof Error ? error.message : 'Failed to load config.',
        );
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isModelSelectorOpen && !target.closest('.model-selector')) {
        setIsModelSelectorOpen(null);
      }
      if (isArenaModeSelectorOpen && !target.closest('.arena-mode-selector')) {
        setIsArenaModeSelectorOpen(false);
      }
    };

    if (isModelSelectorOpen || isArenaModeSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isArenaModeSelectorOpen, isModelSelectorOpen]);

  useEffect(() => {
    if (hasHydratedStoredComparison || config.models.length === 0) {
      return;
    }

    const storedSelection = readStoredComparisonSelection();
    if (!storedSelection) {
      setHasHydratedStoredComparison(true);
      return;
    }

    const modelIdSet = new Set(config.models.map((model) => model.id));
    const nextModelAId = modelIdSet.has(storedSelection.modelAId)
      ? storedSelection.modelAId
      : '';
    const nextModelBId = modelIdSet.has(storedSelection.modelBId)
      ? storedSelection.modelBId
      : '';
    const storedDirectModelId = readStoredDirectModelId();
    const nextDirectModelId = modelIdSet.has(storedDirectModelId)
      ? storedDirectModelId
      : config.models[0]?.id || '';
    const storedArenaMode = readStoredArenaMode();
    const nextArenaMode = storedArenaMode || 'side-by-side';

    setConfig((current) => ({
      ...current,
      comparison: {
        modelAId: nextModelAId,
        modelBId: nextModelBId,
      },
    }));
    setDirectModelId(nextDirectModelId);
    setArenaMode(nextArenaMode);
    setHasHydratedStoredComparison(true);
  }, [config.models, hasHydratedStoredComparison]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!config.comparison.modelAId && !config.comparison.modelBId) {
      window.localStorage.removeItem(COMPARISON_SELECTION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      COMPARISON_SELECTION_STORAGE_KEY,
      JSON.stringify({
        modelAId: config.comparison.modelAId,
        modelBId: config.comparison.modelBId,
      }),
    );
  }, [config.comparison.modelAId, config.comparison.modelBId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(ARENA_MODE_STORAGE_KEY, arenaMode);
  }, [arenaMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!directModelId) {
      window.localStorage.removeItem(DIRECT_MODEL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(DIRECT_MODEL_STORAGE_KEY, directModelId);
  }, [directModelId]);

  useEffect(() => {
    if (!directModelId) {
      return;
    }

    const stillExists = config.models.some((model) => model.id === directModelId);
    if (!stillExists) {
      setDirectModelId(config.models[0]?.id || '');
    }
  }, [config.models, directModelId]);

  const toggleSidebar = () => {
    setIsSidebarOpen((current) => !current);
  };

  const handleModelSelect = (side: 'A' | 'B' | 'Direct', modelId: string) => {
    if (side === 'Direct') {
      setDirectModelId(modelId);
      setArenaMode('direct');
      setLoadedSession(null);
      setMode('chat');
      setIsModelSelectorOpen(null);
      return;
    }

    setConfig((current) => ({
      ...current,
      comparison: {
        ...current.comparison,
        modelAId: side === 'A' ? modelId : current.comparison.modelAId,
        modelBId: side === 'B' ? modelId : current.comparison.modelBId,
      },
    }));
    setLoadedSession(null);
    setArenaMode('side-by-side');
    setMode('chat');
    setIsModelSelectorOpen(null);
  };

  const handleNewChat = () => {
    setLoadedSession(null);
    setArenaMode('side-by-side');
    setDirectModelId('');
    setConfig((current) => ({
      ...current,
      comparison: {
        modelAId: '',
        modelBId: '',
      },
    }));
    setMode('chat');
    setIsArenaModeSelectorOpen(false);
    setIsModelSelectorOpen(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(COMPARISON_SELECTION_STORAGE_KEY);
      window.localStorage.removeItem(ARENA_MODE_STORAGE_KEY);
      window.localStorage.removeItem(DIRECT_MODEL_STORAGE_KEY);
      window.localStorage.removeItem(CODE_COMPARE_DRAFT_STORAGE_KEY);
    }
    setChatResetSeed((current) => current + 1);
  };

  const handleArenaModeChange = (nextMode: ArenaMode) => {
    if (nextMode === 'direct') {
      const fallbackDirectModelId =
        directModelId || config.comparison.modelAId || config.models[0]?.id || '';
      setDirectModelId(fallbackDirectModelId);
    } else if (nextMode === 'side-by-side' && !config.comparison.modelAId) {
      const fallbackModelAId = config.models[0]?.id || '';
      const fallbackModelBId =
        config.models.find((model) => model.id !== fallbackModelAId)?.id || '';
      setConfig((current) => ({
        ...current,
        comparison: {
          modelAId: fallbackModelAId,
          modelBId: current.comparison.modelBId || fallbackModelBId,
        },
      }));
    }

    setArenaMode(nextMode);
    setLoadedSession(null);
    setMode('chat');
    setIsArenaModeSelectorOpen(false);
    setIsModelSelectorOpen(null);
  };

  const handleSelectHistory = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to load session.');
      }

      const nextSession: ChatSession = await response.json();
      setLoadedSession(nextSession);

      if (nextSession.type === 'comparison' || nextSession.type === 'code') {
        setConfig((current) => ({
          ...current,
          comparison: {
            modelAId: nextSession.modelAId,
            modelBId: nextSession.modelBId || '',
          },
        }));
        setArenaMode('side-by-side');
        setMode(nextSession.type === 'code' ? 'code' : 'chat');
      } else {
        setArenaMode('direct');
        setDirectModelId(nextSession.modelAId);
        setMode('chat');
      }
    } catch (error) {
      console.error('Failed to load session', error);
    }
  };

  if (status === 'loading') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Authenticating...</p>
        </div>
      </div>
    );
  }

  const showGuestBanner = status !== 'authenticated';
  const activeView: 'comparison' | string =
    arenaMode === 'side-by-side' ? 'comparison' : directModelId;
  const currentTitle =
    mode === 'code'
      ? 'Code Arena'
      : activeView === 'comparison'
        ? 'Model Arena'
        : config.models.find((model) => model.id === activeView)?.name ||
          config.models.find((model) => model.id === activeView)?.modelId ||
          'Chat';
  const selectedModelA = config.models.find(
    (model) => model.id === config.comparison.modelAId,
  );
  const selectedModelB = config.models.find(
    (model) => model.id === config.comparison.modelBId,
  );
  const selectedDirectModel = config.models.find(
    (model) => model.id === directModelId,
  );
  const isSideBySideMode = mode === 'code' || arenaMode === 'side-by-side';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      <Sidebar
        config={config}
        isOpen={isSidebarOpen}
        onNewChat={handleNewChat}
        onSelectHistory={handleSelectHistory}
        setConfig={setConfig}
      />

      <div className="flex flex-1 flex-col min-w-0 h-full relative">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 z-10">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
            >
              <Menu className="h-5 w-5" />
            </button>
            {mode === 'chat' ? (
              <div className="relative arena-mode-selector">
                <button
                  type="button"
                  onClick={() =>
                    setIsArenaModeSelectorOpen((current) => !current)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  <span className="text-sm font-semibold">Arena</span>
                  <span className="text-[11px] text-slate-500">
                    {arenaMode === 'side-by-side' ? 'Side by Side' : 'Direct'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>

                {isArenaModeSelectorOpen && (
                  <div className="absolute left-0 top-full mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-20">
                    <button
                      type="button"
                      onClick={() => handleArenaModeChange('side-by-side')}
                      className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                        arenaMode === 'side-by-side'
                          ? 'bg-slate-100 text-slate-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <p className="text-sm font-semibold">Side by Side</p>
                      <p className="text-xs text-slate-500">
                        Compare 2 models together
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArenaModeChange('direct')}
                      className={`mt-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                        arenaMode === 'direct'
                          ? 'bg-slate-100 text-slate-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <p className="text-sm font-semibold">Direct</p>
                      <p className="text-xs text-slate-500">
                        Chat with one model
                      </p>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <h1 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                {currentTitle}
              </h1>
            )}
          </div>

          {isSideBySideMode && (
            <div className="absolute left-1/2 -translate-x-1/2 flex justify-center px-4 w-auto pointer-events-none">
              <div className="flex items-center gap-2.5 pointer-events-auto">
                <div className="relative model-selector">
                  <button
                    onClick={() =>
                      setIsModelSelectorOpen(
                        isModelSelectorOpen === 'A' ? null : 'A',
                      )
                    }
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200/60 hover:border-blue-300/60 transition-all duration-200 shadow-sm hover:shadow-md min-w-[140px] justify-center"
                  >
                    <ModelLogo
                      model={selectedModelA}
                      size="sm"
                      className="h-6 w-6 rounded-lg text-[10px]"
                    />
                    <span className="text-xs font-semibold text-blue-700 truncate">
                      {selectedModelA?.name || selectedModelA?.modelId || 'Select Model A'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
                  </button>

                  {isModelSelectorOpen === 'A' && (
                    <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-20 max-h-64 overflow-y-auto model-selector">
                      {sortedModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelSelect('A', model.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-all ${
                            config.comparison.modelAId === model.id
                              ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          <ModelLogo
                            model={model}
                            size="sm"
                            className="h-6 w-6 rounded-lg text-[10px]"
                          />
                          <span className="truncate">{model.name || model.modelId}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 border border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 italic">VS</span>
                </div>

                <div className="relative model-selector">
                  <button
                    onClick={() =>
                      setIsModelSelectorOpen(
                        isModelSelectorOpen === 'B' ? null : 'B',
                      )
                    }
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200/60 hover:border-purple-300/60 transition-all duration-200 shadow-sm hover:shadow-md min-w-[140px] justify-center"
                  >
                    <ModelLogo
                      model={selectedModelB}
                      size="sm"
                      className="h-6 w-6 rounded-lg text-[10px]"
                    />
                    <span className="text-xs font-semibold text-purple-700 truncate">
                      {selectedModelB?.name || selectedModelB?.modelId || 'Select Model B'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-purple-500" />
                  </button>

                  {isModelSelectorOpen === 'B' && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-20 max-h-64 overflow-y-auto model-selector">
                      {sortedModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelSelect('B', model.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-all ${
                            config.comparison.modelBId === model.id
                              ? 'bg-purple-50 text-purple-700 border-l-4 border-purple-500'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          <ModelLogo
                            model={model}
                            size="sm"
                            className="h-6 w-6 rounded-lg text-[10px]"
                          />
                          <span className="truncate">{model.name || model.modelId}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {!isSideBySideMode && mode === 'chat' && (
            <div className="absolute left-1/2 -translate-x-1/2 flex justify-center px-4 w-auto pointer-events-none">
              <div className="relative model-selector pointer-events-auto">
                <button
                  onClick={() =>
                    setIsModelSelectorOpen(
                      isModelSelectorOpen === 'Direct' ? null : 'Direct',
                    )
                  }
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all duration-200 shadow-sm hover:shadow-md min-w-[190px] justify-center"
                >
                  <ModelLogo
                    model={selectedDirectModel}
                    size="sm"
                    className="h-6 w-6 rounded-lg text-[10px]"
                  />
                  <span className="text-xs font-semibold text-slate-700 truncate">
                    {selectedDirectModel?.name ||
                      selectedDirectModel?.modelId ||
                      'Select Model'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>

                {isModelSelectorOpen === 'Direct' && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-20 max-h-64 overflow-y-auto model-selector">
                    {sortedModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelSelect('Direct', model.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-all ${
                          directModelId === model.id
                            ? 'bg-slate-100 text-slate-900 border-l-4 border-slate-500'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <ModelLogo
                          model={model}
                          size="sm"
                          className="h-6 w-6 rounded-lg text-[10px]"
                        />
                        <span className="truncate">{model.name || model.modelId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 z-10">
            {mode === 'code' && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 shadow-inner mx-4">
                <button
                  type="button"
                  onClick={() => {
                    setLeftMode('code');
                    setRightMode('code');
                  }}
                  className={`flex items-center justify-center p-2 rounded-lg transition-all ${
                    leftMode === 'code' && rightMode === 'code'
                      ? 'bg-white text-blue-600 shadow-sm scale-[1.02]'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                  }`}
                  title="All Code"
                >
                  <Code className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLeftMode('preview');
                    setRightMode('preview');
                  }}
                  className={`flex items-center justify-center p-2 rounded-lg transition-all ${
                    leftMode === 'preview' && rightMode === 'preview'
                      ? 'bg-white text-blue-600 shadow-sm scale-[1.02]'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                  }`}
                  title="All Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('chat');
                if (arenaMode !== 'side-by-side') {
                  handleArenaModeChange('side-by-side');
                }
              }}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                mode === 'chat'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Chat Compare
            </button>
            <button
              type="button"
              onClick={() => setMode('code')}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                mode === 'code'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Code Compare
            </button>
          </div>
        </header>

        {(showGuestBanner || configError) && (
          <div className="px-6 pt-4 space-y-3">
            {showGuestBanner && (
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 mt-0.5 text-amber-600" />
                  <div>
                    <p className="font-medium">Guest mode</p>
                    <p className="text-amber-800/90">
                      You can browse the Arena UI, but model setup, testing, and
                      session saving require sign-in.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => signIn('google', { callbackUrl: '/' })}
                  className="shrink-0 rounded-xl bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-950 transition-colors"
                >
                  Sign In
                </button>
              </div>
            )}

            {configError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {configError}
              </div>
            )}
          </div>
        )}

        <main className="flex-1 overflow-hidden relative min-h-0">
          {mode === 'chat' ? (
            <ChatInterface
              key={`chat-${arenaMode}-${activeView}-${config.comparison.modelAId}-${config.comparison.modelBId}-${directModelId}-${chatResetSeed}`}
              activeView={activeView}
              config={config}
              loadedSession={mode === 'chat' ? loadedSession : null}
            />
          ) : (
            <CodeCompareInterface
              key={`code-${config.comparison.modelAId}-${config.comparison.modelBId}-${chatResetSeed}`}
              config={config}
              loadedSession={mode === 'code' ? loadedSession : null}
              leftMode={leftMode}
              rightMode={rightMode}
              setLeftMode={setLeftMode}
              setRightMode={setRightMode}
            />
          )}
        </main>
      </div>
    </div>
  );
}
