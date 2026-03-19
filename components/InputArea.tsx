import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface InputAreaProps {
  disabled?: boolean;
  disabledHint?: string;
  isLoading: boolean;
  onSend: (message: string) => void;
  placeholder?: string;
  position?: 'top' | 'bottom';
}

export function InputArea({
  disabled = false,
  disabledHint,
  isLoading,
  onSend,
  placeholder = 'Ask anything...',
  position = 'bottom',
}: InputAreaProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isLoading || disabled) {
      return;
    }

    onSend(input);
    setInput('');
  };

  return (
    <div
      className={`absolute left-0 right-0 px-4 z-20 ${
        position === 'top' ? 'top-3' : 'bottom-0'
      }`}
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl relative pointer-events-auto">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/95 backdrop-blur-xl px-2.5 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.1)] ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-blue-500/45 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.14)] relative">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent px-2 py-1.5 pr-8 outline-none text-slate-700 placeholder:text-slate-400 text-sm"
            disabled={isLoading}
          />

          <button
            type="submit"
            disabled={!input.trim() || disabled || isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-all shadow-md"
            title="Send"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="text-center mt-1.5">
          <p className="text-[10px] text-slate-400 font-medium">
            {disabledHint || 'AI can make mistakes. Please verify important information.'}
          </p>
        </div>
      </form>
    </div>
  );
}
