import { ModelConfig, ModelProvider } from '@/lib/types';

type BrandMeta = {
  bgClassName: string;
  borderClassName: string;
  label: string;
  text: string;
  textClassName: string;
};

const DEFAULT_BRAND_META: BrandMeta = {
  label: 'Model',
  text: 'AI',
  bgClassName: 'bg-slate-100',
  textClassName: 'text-slate-700',
  borderClassName: 'border-slate-200',
};

const PROVIDER_BRAND_META: Partial<Record<ModelProvider, BrandMeta>> = {
  anthropic: {
    label: 'Anthropic',
    text: 'AN',
    bgClassName: 'bg-[#F7F3EC]',
    textClassName: 'text-[#191919]',
    borderClassName: 'border-[#E8DFCf]',
  },
  deepseek: {
    label: 'DeepSeek',
    text: 'DS',
    bgClassName: 'bg-blue-50',
    textClassName: 'text-blue-700',
    borderClassName: 'border-blue-200',
  },
  groq: {
    label: 'Groq',
    text: 'Gr',
    bgClassName: 'bg-orange-50',
    textClassName: 'text-orange-700',
    borderClassName: 'border-orange-200',
  },
  minimax: {
    label: 'MiniMax (China)',
    text: 'MM',
    bgClassName: 'bg-teal-50',
    textClassName: 'text-teal-700',
    borderClassName: 'border-teal-200',
  },
  'minimax-intl': {
    label: 'MiniMax (International)',
    text: 'MM',
    bgClassName: 'bg-teal-50',
    textClassName: 'text-teal-700',
    borderClassName: 'border-teal-200',
  },
  moonshot: {
    label: 'Kimi (Moonshot AI)',
    text: 'KM',
    bgClassName: 'bg-[#6B46FE]/10',
    textClassName: 'text-[#6B46FE]',
    borderClassName: 'border-[#6B46FE]/20',
  },
  openai: {
    label: 'OpenAI',
    text: 'OA',
    bgClassName: 'bg-emerald-50',
    textClassName: 'text-emerald-700',
    borderClassName: 'border-emerald-200',
  },
  qwen: {
    label: 'Qwen',
    text: 'QW',
    bgClassName: 'bg-indigo-50',
    textClassName: 'text-indigo-700',
    borderClassName: 'border-indigo-200',
  },
  openrouter: {
    label: 'OpenRouter',
    text: 'OR',
    bgClassName: 'bg-white',
    textClassName: 'text-[#4F46E5]',
    borderClassName: 'border-slate-200',
  },
  siliconflow: {
    label: 'SiliconFlow',
    text: 'SF',
    bgClassName: 'bg-purple-50',
    textClassName: 'text-purple-700',
    borderClassName: 'border-purple-200',
  },
  together: {
    label: 'Together AI',
    text: 'TG',
    bgClassName: 'bg-blue-50',
    textClassName: 'text-blue-700',
    borderClassName: 'border-blue-200',
  },
  xai: {
    label: 'xAI',
    text: 'xA',
    bgClassName: 'bg-slate-900',
    textClassName: 'text-white',
    borderClassName: 'border-slate-800',
  },
  xiaomi: {
    label: 'Xiaomi',
    text: 'MI',
    bgClassName: 'bg-orange-50',
    textClassName: 'text-orange-700',
    borderClassName: 'border-orange-200',
  },
  zhipu: {
    label: 'Zhipu (GLM)',
    text: 'GL',
    bgClassName: 'bg-lime-50',
    textClassName: 'text-lime-700',
    borderClassName: 'border-lime-200',
  },
};

const BRAND_RULES: Array<{
  label: string;
  match: (value: string) => boolean;
  meta: Omit<BrandMeta, 'label'>;
}> = [
  {
    label: 'OpenAI',
    match: (value) =>
      /(^|[\W_])(openai|gpt|chatgpt|o1|o3|o4)([\W_]|$)/i.test(value),
    meta: {
      text: 'OA',
      bgClassName: 'bg-white',
      textClassName: 'text-black',
      borderClassName: 'border-slate-200',
    },
  },
  {
    label: 'Anthropic',
    match: (value) => /(^|[\W_])(anthropic|claude)([\W_]|$)/i.test(value),
    meta: {
      text: 'AN',
      bgClassName: 'bg-[#F7F3EC]',
      textClassName: 'text-[#191919]',
      borderClassName: 'border-[#E8DFCf]',
    },
  },
  {
    label: 'OpenRouter',
    match: (value) => /(^|[\W_])(openrouter)([\W_]|$)/i.test(value),
    meta: {
      text: 'OR',
      bgClassName: 'bg-white',
      textClassName: 'text-[#4F46E5]',
      borderClassName: 'border-slate-200',
    },
  },
  {
    label: 'xAI',
    match: (value) => /(^|[\W_])(xai|grok)([\W_]|$)/i.test(value),
    meta: {
      text: 'xA',
      bgClassName: 'bg-slate-900',
      textClassName: 'text-white',
      borderClassName: 'border-slate-800',
    },
  },
  {
    label: 'Gemini',
    match: (value) => /(^|[\W_])(gemini|google)([\W_]|$)/i.test(value),
    meta: {
      text: 'Gm',
      bgClassName: 'bg-sky-100',
      textClassName: 'text-sky-700',
      borderClassName: 'border-sky-200',
    },
  },
  {
    label: 'DeepSeek',
    match: (value) => /(^|[\W_])(deepseek)([\W_]|$)/i.test(value),
    meta: {
      text: 'DS',
      bgClassName: 'bg-blue-100',
      textClassName: 'text-blue-700',
      borderClassName: 'border-blue-200',
    },
  },
  {
    label: 'Qwen',
    match: (value) => /(^|[\W_])(qwen|tongyi)([\W_]|$)/i.test(value),
    meta: {
      text: 'Qw',
      bgClassName: 'bg-amber-100',
      textClassName: 'text-amber-700',
      borderClassName: 'border-amber-200',
    },
  },
  {
    label: 'Kimi (Moonshot AI)',
    match: (value) => /(^|[\W_])(moonshot|kimi)([\W_]|$)/i.test(value),
    meta: {
      text: 'KM',
      bgClassName: 'bg-[#6B46FE]/10',
      textClassName: 'text-[#6B46FE]',
      borderClassName: 'border-[#6B46FE]/20',
    },
  },
  {
    label: 'Mistral',
    match: (value) => /(^|[\W_])(mistral)([\W_]|$)/i.test(value),
    meta: {
      text: 'Ms',
      bgClassName: 'bg-rose-100',
      textClassName: 'text-rose-700',
      borderClassName: 'border-rose-200',
    },
  },
  {
    label: 'Llama',
    match: (value) => /(^|[\W_])(llama|meta)([\W_]|$)/i.test(value),
    meta: {
      text: 'Ll',
      bgClassName: 'bg-cyan-100',
      textClassName: 'text-cyan-700',
      borderClassName: 'border-cyan-200',
    },
  },
  {
    label: 'GLM',
    match: (value) => /(^|[\W_])(glm|zhipu)([\W_]|$)/i.test(value),
    meta: {
      text: 'GL',
      bgClassName: 'bg-lime-100',
      textClassName: 'text-lime-700',
      borderClassName: 'border-lime-200',
    },
  },
];

function getProviderLabel(provider: ModelProvider) {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic';
    case 'deepseek':
      return 'DeepSeek';
    case 'groq':
      return 'Groq';
    case 'minimax':
      return 'MiniMax (China)';
    case 'minimax-intl':
      return 'MiniMax (International)';
    case 'moonshot':
      return 'Kimi (Moonshot AI)';
    case 'openai':
      return 'OpenAI';
    case 'openrouter':
      return 'OpenRouter';
    case 'qwen':
      return 'Qwen';
    case 'siliconflow':
      return 'SiliconFlow';
    case 'together':
      return 'Together AI';
    case 'xiaomi':
      return 'Xiaomi';
    case 'xai':
      return 'xAI';
    case 'zhipu':
      return 'Zhipu (GLM)';
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

export function getModelBrandMeta(
  model?: Partial<ModelConfig> | null,
): BrandMeta {
  if (!model) {
    return DEFAULT_BRAND_META;
  }

  if (model.provider && model.provider !== 'custom') {
    const providerMeta = PROVIDER_BRAND_META[model.provider];
    if (providerMeta) {
      return providerMeta;
    }
  }

  const candidates = [
    model.modelId,
    model.name,
    model.baseUrl,
    model.provider ? getProviderLabel(model.provider) : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const matchedRule = BRAND_RULES.find((rule) => rule.match(candidates));
  if (matchedRule) {
    return {
      label: matchedRule.label,
      ...matchedRule.meta,
    };
  }

  if (model.provider) {
    const providerLabel = getProviderLabel(model.provider);
    return {
      ...DEFAULT_BRAND_META,
      label: providerLabel,
      text: providerLabel.slice(0, 2),
    };
  }

  return DEFAULT_BRAND_META;
}
