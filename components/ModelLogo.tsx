import React from 'react';

import { ModelConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getModelBrandMeta } from '@/lib/model-brand';

interface ModelLogoProps {
  model?: Partial<ModelConfig> | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
};

const providerAssetMap: Record<string, string> = {
  Anthropic: '/provider-logos/anthropic.svg',
  DeepSeek: '/provider-logos/deepseek.svg',
  Groq: '/provider-logos/groq.svg',
  'MiniMax': '/provider-logos/minimax.svg',
  OpenAI: '/provider-logos/openai.svg',
  OpenRouter: '/provider-logos/openrouter.svg',
  SiliconFlow: '/provider-logos/siliconflow.svg',
  'Together AI': '/provider-logos/together.svg',
  'Zhipu (GLM)': '/provider-logos/zhipu.svg',
};

export function ModelLogo({
  model,
  className,
  size = 'md',
}: ModelLogoProps) {
  const meta = getModelBrandMeta(model);
  const assetPath = providerAssetMap[meta.label] || providerAssetMap[model?.provider || ''];

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl border font-semibold tracking-tight uppercase',
        sizeClasses[size],
        meta.bgClassName,
        meta.borderClassName,
        meta.textClassName,
        className,
      )}
      title={meta.label}
      aria-label={meta.label}
    >
      {assetPath ? (
        <img
          alt={meta.label}
          src={assetPath}
          className="h-[72%] w-[72%] object-contain"
        />
      ) : (
        meta.text || (model?.provider ? model.provider.slice(0, 2) : '?')
      )}
    </div>
  );
}
