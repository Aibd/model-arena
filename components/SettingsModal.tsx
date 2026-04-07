import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Edit2,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
  Save,
  TestTube,
  Trash2,
  X,
} from 'lucide-react';

import { ModelLogo } from '@/components/ModelLogo';
import {
  AppConfig,
  ModelConfig,
  ModelProvider,
  ProviderSettings,
} from '@/lib/types';

interface SettingsModalProps {
  initialConfig: AppConfig;
  isOpen: boolean;
  isReadOnly?: boolean;
  onClose: () => void;
  onRequireSignIn?: () => void;
  onSave: (config: AppConfig) => void;
}

const PROVIDERS: Array<{
  defaultBaseUrl: string;
  label: string;
  value: ModelProvider;
}> = [
  { value: 'openrouter', label: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com' },
  { value: 'xai', label: 'xAI', defaultBaseUrl: 'https://api.x.ai/v1' },
  { value: 'minimax', label: 'MiniMax (China)', defaultBaseUrl: 'https://api.minimaxi.com/v1' },
  { value: 'minimax-intl', label: 'MiniMax (International)', defaultBaseUrl: 'https://api.minimax.io/v1' },
  { value: 'moonshot', label: 'Kimi (Moonshot AI)', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  { value: 'zhipu', label: 'Zhipu (GLM)', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'groq', label: 'Groq', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
  { value: 'siliconflow', label: 'SiliconFlow', defaultBaseUrl: 'https://api.siliconflow.cn/v1' },
  { value: 'together', label: 'Together AI', defaultBaseUrl: 'https://api.together.xyz/v1' },
  { value: 'qwen', label: 'Qwen', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'xiaomi', label: 'Xiaomi', defaultBaseUrl: 'https://api.xiaomimimo.com/v1' },
];

const defaultProvider = PROVIDERS[0].value;

function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function resolveProviderPreviewId(name: string): string {
  const normalized = normalizeProviderName(name);
  if (!normalized) return 'custom';
  const matched = PROVIDERS.find(
    (provider) =>
      provider.value === normalized || normalizeProviderName(provider.label) === normalized,
  );
  return matched?.value || normalized;
}

function createEmptyModel(provider: ModelProvider = defaultProvider): Partial<ModelConfig> {
  return { provider, modelId: '', name: '' };
}

function getProviderMeta(provider: ModelProvider, config?: AppConfig) {
  const builtIn = PROVIDERS.find((item) => item.value === provider);
  if (builtIn) return builtIn;
  const custom = config?.providerSettings.find((item) => item.provider === provider);
  return {
    value: provider,
    label: custom?.customName || provider,
    defaultBaseUrl: custom?.baseUrl || '',
  };
}

function getProviderSettings(config: AppConfig, provider: ModelProvider): ProviderSettings {
  return (
    config.providerSettings.find((item) => item.provider === provider) || {
      provider,
      apiKey: '',
      baseUrl: getProviderMeta(provider, config).defaultBaseUrl,
    }
  );
}

function upsertProviderSettings(settings: ProviderSettings[], nextSetting: ProviderSettings) {
  const filtered = settings.filter((item) => item.provider !== nextSetting.provider);
  const hasPersistedValue =
    Boolean(nextSetting.apiKey?.trim()) ||
    Boolean(nextSetting.baseUrl?.trim()) ||
    Boolean(nextSetting.customName?.trim()) ||
    Boolean(nextSetting.customLogoText?.trim());
  if (!hasPersistedValue) return filtered;
  return [...filtered, nextSetting];
}

export function SettingsModal({
  initialConfig,
  isOpen,
  isReadOnly = false,
  onClose,
  onRequireSignIn,
  onSave,
}: SettingsModalProps) {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>(defaultProvider);
  const [newModel, setNewModel] = useState<Partial<ModelConfig>>(createEmptyModel());
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [isAddingCustomProvider, setIsAddingCustomProvider] = useState(false);
  const [editingCustomProviderId, setEditingCustomProviderId] = useState<string | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  const [openMenuProviderId, setOpenMenuProviderId] = useState<string | null>(null);
  const [newCustomProvider, setNewCustomProvider] = useState({ name: '', baseUrl: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ message: string; success: boolean } | null>(null);

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedProvider(defaultProvider);
      setNewModel(createEmptyModel());
      setEditingModelId(null);
      setIsAddingModel(false);
      setIsAddingCustomProvider(false);
      setEditingCustomProviderId(null);
      setProviderToDelete(null);
      setOpenMenuProviderId(null);
      setNewCustomProvider({ name: '', baseUrl: '' });
      setTestResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!openMenuProviderId) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.provider-menu-container')) setOpenMenuProviderId(null);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openMenuProviderId]);

  const allProviders = useMemo(() => {
    const builtInProviderIds = new Set(PROVIDERS.map((provider) => provider.value));
    const providerSettingsById = new Map(
      config.providerSettings.map((setting) => [setting.provider, setting]),
    );

    const staticProviders = PROVIDERS.filter(
      (provider) => !(config.hiddenProviders || []).includes(provider.value),
    ).map((provider) => {
      const customSetting = providerSettingsById.get(provider.value);
      return {
        ...provider,
        label: customSetting?.customName || provider.label,
        defaultBaseUrl: customSetting?.baseUrl || provider.defaultBaseUrl,
        isCustom: false,
      };
    });

    const customProviders = config.providerSettings
      .filter((setting) => !builtInProviderIds.has(setting.provider))
      .map((setting) => ({
        value: setting.provider,
        label: setting.customName || setting.provider,
        defaultBaseUrl: setting.baseUrl || '',
        isCustom: true,
      }));

    return [...staticProviders, ...customProviders];
  }, [config.hiddenProviders, config.providerSettings]);

  const selectedProviderMeta =
    allProviders.find((provider) => provider.value === selectedProvider) || {
      ...getProviderMeta(selectedProvider, config),
      isCustom: false,
    };

  const activeProviderSettings = getProviderSettings(config, selectedProvider);
  const modelProviderSettings = getProviderSettings(
    config,
    (newModel.provider as ModelProvider) || selectedProvider,
  );
  const modelsForSelectedProvider = config.models.filter((model) => model.provider === selectedProvider);
  const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(initialConfig);

  if (!isOpen) return null;

  const requireEditAccess = () => {
    if (!isReadOnly) return true;
    onRequireSignIn?.();
    return false;
  };

  const applyConfigUpdate = (
    updater: (current: AppConfig) => AppConfig,
    options?: { persist?: boolean },
  ) => {
    setConfig((current) => {
      const nextConfig = updater(current);
      if (options?.persist) {
        onSave(nextConfig);
      }
      return nextConfig;
    });
  };

  const selectProvider = (provider: ModelProvider) => {
    setSelectedProvider(provider);
    setNewModel((current) => ({ ...current, provider }));
    setIsAddingCustomProvider(false);
    setProviderToDelete(null);
    setOpenMenuProviderId(null);
    setTestResult(null);
  };

  const updateProviderSettings = (provider: ModelProvider, updates: Partial<ProviderSettings>) => {
    setConfig((current) => ({
      ...current,
      providerSettings: upsertProviderSettings(current.providerSettings, {
        ...getProviderSettings(current, provider),
        ...updates,
        provider,
      }),
      models: current.models.map((model) =>
        model.provider === provider
          ? {
              ...model,
              apiKey: updates.apiKey ?? getProviderSettings(current, provider).apiKey,
              baseUrl: updates.baseUrl ?? getProviderSettings(current, provider).baseUrl,
            }
          : model,
      ),
    }));
  };

  const resetModelForm = () => {
    setEditingModelId(null);
    setIsAddingModel(false);
    setNewModel(createEmptyModel(selectedProvider));
    setTestResult(null);
  };

  const handleAddCustomProvider = () => {
    if (!requireEditAccess() || !newCustomProvider.name.trim()) return;
    const providerId = editingCustomProviderId || normalizeProviderName(newCustomProvider.name);
    setConfig((current) => ({
      ...current,
      providerSettings: upsertProviderSettings(current.providerSettings, {
        ...getProviderSettings(current, providerId),
        provider: providerId,
        customName: newCustomProvider.name.trim(),
        baseUrl: newCustomProvider.baseUrl.trim(),
      }),
    }));
    setSelectedProvider(providerId);
    setIsAddingCustomProvider(false);
    setEditingCustomProviderId(null);
    setNewCustomProvider({ name: '', baseUrl: '' });
  };

  const handleEditCustomProvider = (provider: { value: string; label: string; defaultBaseUrl: string }) => {
    if (!requireEditAccess()) return;
    setEditingCustomProviderId(provider.value);
    setNewCustomProvider({ name: provider.label, baseUrl: provider.defaultBaseUrl });
    setIsAddingCustomProvider(true);
  };

  const handleRemoveProvider = (providerId: string) => {
    if (!requireEditAccess()) return;
    const isBuiltIn = PROVIDERS.some((provider) => provider.value === providerId);
    applyConfigUpdate(
      (current) => ({
        ...current,
        providerSettings: current.providerSettings.filter((item) => item.provider !== providerId),
        models: current.models.filter((item) => item.provider !== providerId),
        hiddenProviders: isBuiltIn
          ? Array.from(new Set([...(current.hiddenProviders || []), providerId]))
          : current.hiddenProviders,
        comparison: {
          modelAId: current.comparison.modelAId,
          modelBId: current.comparison.modelBId,
        },
      }),
      { persist: true },
    );
    if (selectedProvider === providerId) {
      setSelectedProvider(defaultProvider);
    }
    setProviderToDelete(null);
    setOpenMenuProviderId(null);
  };

  const handleRestoreProviders = () => {
    if (!requireEditAccess()) return;
    setConfig((current) => ({ ...current, hiddenProviders: [] }));
  };

  const handleAddOrUpdateModel = () => {
    if (!requireEditAccess()) return;
    const provider = (newModel.provider as ModelProvider) || selectedProvider;
    const providerSettings = getProviderSettings(config, provider);
    if (!newModel.modelId || !providerSettings.apiKey) return;

    const nextModel: ModelConfig = {
      id: editingModelId || crypto.randomUUID(),
      name: newModel.name || newModel.modelId,
      provider,
      apiKey: providerSettings.apiKey,
      modelId: newModel.modelId,
      baseUrl: providerSettings.baseUrl,
    };

    setConfig((current) => ({
      ...current,
      models: editingModelId
        ? current.models.map((model) => (model.id === editingModelId ? nextModel : model))
        : [...current.models, nextModel],
    }));

    resetModelForm();
  };

  const handleEditModel = (model: ModelConfig) => {
    if (!requireEditAccess()) return;
    setEditingModelId(model.id);
    setSelectedProvider(model.provider);
    setNewModel({ provider: model.provider, modelId: model.modelId, name: model.name });
  };

  const handleRemoveModel = (id: string) => {
    if (!requireEditAccess()) return;
    applyConfigUpdate(
      (current) => ({
        ...current,
        models: current.models.filter((model) => model.id !== id),
        comparison: {
          modelAId: current.comparison.modelAId === id ? '' : current.comparison.modelAId,
          modelBId: current.comparison.modelBId === id ? '' : current.comparison.modelBId,
        },
      }),
      { persist: true },
    );
    if (editingModelId === id) {
      resetModelForm();
    }
  };

  const handleTestModel = async () => {
    if (!requireEditAccess()) return;
    const provider = (newModel.provider as ModelProvider) || selectedProvider;
    const providerSettings = getProviderSettings(config, provider);
    if (!newModel.modelId || !providerSettings.apiKey) {
      setTestResult({ success: false, message: 'Please fill in API Key and Model ID first.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelConfig: {
            name: newModel.name || newModel.modelId,
            provider,
            apiKey: providerSettings.apiKey,
            modelId: newModel.modelId,
            baseUrl: providerSettings.baseUrl,
          },
        }),
      });
      const payload = await response.json();
      setTestResult({
        success: Boolean(payload.success),
        message: payload.message || payload.error || 'Test failed',
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Configuration</h2>
            <p className="mt-1 text-xs text-slate-500">
              Configure providers first, then manage models under each provider.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {allProviders.map((provider) => {
                  const isActive = provider.value === selectedProvider;
                  return (
                    <div
                      key={provider.value}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectProvider(provider.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') selectProvider(provider.value);
                      }}
                      className={`group flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-3 text-left outline-none transition-colors ${
                        isActive ? 'border-blue-300 bg-white shadow-sm' : 'border-transparent bg-transparent hover:bg-white'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ModelLogo model={{ provider: provider.value }} size="sm" />
                        <p className="truncate text-sm font-medium text-slate-800">{provider.label}</p>
                      </div>
                      <div className="provider-menu-container flex shrink-0 items-center gap-1">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuProviderId(openMenuProviderId === provider.value ? null : provider.value);
                            }}
                            className={`rounded-lg p-1.5 transition-all ${
                              openMenuProviderId === provider.value
                                ? 'bg-slate-200 text-slate-700 opacity-100'
                                : isActive
                                  ? 'text-slate-400 opacity-100 hover:bg-slate-200 hover:text-slate-600'
                                  : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                            aria-label="More actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuProviderId === provider.value && (
                            <div className="absolute right-full top-1/2 z-[100] mr-2 flex -translate-y-1/2 flex-col rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditCustomProvider(provider);
                                  setOpenMenuProviderId(null);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                                title="Edit"
                                aria-label="Edit"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setProviderToDelete(provider.value);
                                  setOpenMenuProviderId(null);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-red-50 hover:text-red-600"
                                title="Delete"
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsAddingCustomProvider(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-blue-300 hover:bg-white hover:text-blue-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {config.hiddenProviders && config.hiddenProviders.length > 0 && (
                  <button
                    onClick={handleRestoreProviders}
                    className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-500 hover:border-emerald-300 hover:bg-white hover:text-emerald-600"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              {providerToDelete ? (
                <div className="w-full space-y-4 rounded-xl border-2 border-red-200 bg-red-50 p-5 shadow-sm">
                  <div className="flex items-center gap-4 text-red-800">
                    <div className="rounded-full bg-red-100 p-3"><Trash2 className="h-6 w-6 text-red-600" /></div>
                    <div>
                      <h3 className="text-base font-bold">Delete Provider</h3>
                      <p className="mt-1 text-sm text-red-600/80">This will also remove all models under this provider.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setProviderToDelete(null)} className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button type="button" onClick={() => handleRemoveProvider(providerToDelete)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 active:bg-red-200"><Trash2 className="h-4 w-4" />Confirm Delete</button>
                  </div>
                </div>
              ) : isAddingCustomProvider ? (
                <div className="w-full space-y-4 rounded-xl border-2 border-blue-500 bg-white p-6 shadow-lg">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="text-lg font-bold text-slate-800">{editingCustomProviderId ? 'Edit Provider' : 'Add Provider'}</h3>
                    <button onClick={() => { setIsAddingCustomProvider(false); setEditingCustomProviderId(null); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Provider Name</label>
                      <div className="flex items-center gap-3">
                        <ModelLogo model={{ provider: resolveProviderPreviewId(newCustomProvider.name) }} size="sm" />
                        <input autoFocus type="text" value={newCustomProvider.name} onChange={(event) => setNewCustomProvider((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. OpenAI, Ollama, LocalAI" className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Base URL</label>
                      <input type="text" value={newCustomProvider.baseUrl} onChange={(event) => setNewCustomProvider((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="http://localhost:11434/v1" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                    <div className="flex w-full gap-3 pt-2">
                      <button type="button" onClick={() => { setIsAddingCustomProvider(false); setEditingCustomProviderId(null); }} className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                      <button
                        type="button"
                        onClick={handleAddCustomProvider}
                        disabled={!newCustomProvider.name.trim()}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 py-2.5 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <Check className="h-4 w-4" />
                        Confirm Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">API Key</label>
                      <input type="text" value={activeProviderSettings.apiKey} onChange={(event) => updateProviderSettings(selectedProvider, { apiKey: event.target.value })} disabled={isReadOnly} placeholder="sk-..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Base URL</label>
                      <input type="text" value={activeProviderSettings.baseUrl || ''} onChange={(event) => updateProviderSettings(selectedProvider, { baseUrl: event.target.value })} disabled={isReadOnly} placeholder={selectedProviderMeta.defaultBaseUrl} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex min-h-[20rem] flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-end gap-2">
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{modelsForSelectedProvider.length}</span>
                  <button type="button" onClick={() => { if (!requireEditAccess()) return; setEditingModelId(null); setIsAddingModel(true); setNewModel(createEmptyModel(selectedProvider)); setTestResult(null); }} disabled={isReadOnly} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                  {(isAddingModel || editingModelId) && (
                    <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                        <input
                          type="text"
                          value={newModel.modelId || ''}
                          onChange={(event) => {
                            const val = event.target.value;
                            setNewModel((current) => {
                              const shouldSyncName = !current.name || current.name === current.modelId;
                              return {
                                ...current,
                                modelId: val,
                                name: shouldSyncName ? val : current.name,
                              };
                            });
                          }}
                          placeholder="Model ID"
                          disabled={isReadOnly}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
                        />
                        <input
                          type="text"
                          value={newModel.name || ''}
                          onChange={(event) => setNewModel((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Model name"
                          disabled={isReadOnly}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleTestModel} disabled={isReadOnly || isTesting || !newModel.modelId || !modelProviderSettings.apiKey} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">{isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}Test</button>
                          <button onClick={handleAddOrUpdateModel} disabled={isReadOnly || !newModel.modelId || !modelProviderSettings.apiKey} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Confirm</button>
                          <button type="button" onClick={resetModelForm} className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {testResult && (
                        <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${testResult.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                          {testResult.success ? <Check className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                          <p className="leading-5">{testResult.message}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {modelsForSelectedProvider.length === 0 && !isAddingModel && !editingModelId && <p className="py-2 text-sm italic text-slate-400">No models added for this provider yet.</p>}

                  {modelsForSelectedProvider.map((model) => (
                    <div key={model.id} className={`flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 shadow-sm transition-all ${editingModelId === model.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <ModelLogo model={model} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{model.name}</p>
                          <p className="text-xs text-slate-500">{model.modelId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEditModel(model)} disabled={isReadOnly} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-500 disabled:opacity-40"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => handleRemoveModel(model.id)} disabled={isReadOnly} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {isReadOnly && onRequireSignIn ? (
            <button onClick={onRequireSignIn} className="flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2 text-white hover:bg-slate-800">Sign In to Edit</button>
          ) : (
            <button onClick={() => { onSave(config); onClose(); }} disabled={!hasUnsavedChanges} className="flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
