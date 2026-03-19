export type ModelProvider = string;

export interface ProviderSettings {
    provider: ModelProvider;
    apiKey: string;
    baseUrl?: string;
    customName?: string;
    customLogoText?: string;
}

export interface ModelConfig {
    id: string;
    name: string;
    provider: ModelProvider;
    apiKey: string;
    baseUrl?: string; // Optional for OpenAI/Anthropic defaults
    modelId: string; // The actual model string ID (e.g., 'gpt-4', 'claude-3-opus')
}

export interface AppConfig {
    providerSettings: ProviderSettings[];
    models: ModelConfig[];
    hiddenProviders?: string[];
    comparison: {
        modelAId: string; // ID of the model config
        modelBId: string;
    };
}

export interface Message {
    id: string;
    role: 'system' | 'user' | 'assistant' | 'data' | 'function' | 'tool';
    content: string;
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    type: 'comparison' | 'single' | 'code';
    modelAId: string;
    modelBId?: string;
    messagesA: Message[];
    messagesB: Message[]; // Empty if single
}
