import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Key, Robot, Warning } from '@phosphor-icons/react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/ui/Toast';
import { isTauri, type Provider } from '@/src/lib/api';
import { useUIStore } from '@/src/stores/uiStore';
import { cn } from '@/src/lib/utils';

export const PROVIDER_OPTIONS: ReadonlyArray<{
  id: Provider;
  label: string;
  description: string;
  keyPlaceholder: string;
}> = [
  { id: 'deepseek', label: 'DeepSeek', description: '默认云端 provider', keyPlaceholder: 'DeepSeek API key' },
  { id: 'openai', label: 'OpenAI', description: 'OpenAI API', keyPlaceholder: 'OpenAI API key' },
  { id: 'anthropic', label: 'Anthropic', description: 'Claude API', keyPlaceholder: 'Anthropic API key' },
  { id: 'gemini', label: 'Gemini', description: 'Google AI API', keyPlaceholder: 'Gemini API key' },
  { id: 'ollama', label: 'Ollama', description: '本地运行', keyPlaceholder: '' },
];

const PROVIDER_IDS = PROVIDER_OPTIONS.map((provider) => provider.id);

export function isProvider(value: string): value is Provider {
  return PROVIDER_IDS.includes(value as Provider);
}

type ProviderStatus = Record<Provider, boolean | null>;

function emptyProviderStatus(): ProviderStatus {
  return {
    deepseek: null,
    openai: null,
    anthropic: null,
    gemini: null,
    ollama: true,
  };
}

async function invokeProviderCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

function providerLabel(provider: Provider): string {
  return PROVIDER_OPTIONS.find((option) => option.id === provider)?.label ?? provider;
}

export function SettingsApiKeySection() {
  const activeAIProvider = useUIStore((state) => state.activeAIProvider);
  const setActiveAIProvider = useUIStore((state) => state.setActiveAIProvider);
  const [selectedProvider, setSelectedProvider] = useState<Provider>(activeAIProvider);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus>(emptyProviderStatus);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([...PROVIDER_IDS]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const { toast } = useToast();
  const webMode = !isTauri();

  const selectedOption = useMemo(
    () => PROVIDER_OPTIONS.find((option) => option.id === selectedProvider) ?? PROVIDER_OPTIONS[0],
    [selectedProvider],
  );

  useEffect(() => {
    let cancelled = false;

    const loadProviderSettings = async () => {
      if (!isTauri()) {
        if (!cancelled) {
          setSelectedProvider('gemini');
          setActiveAIProvider('gemini');
          setIsLoading(false);
        }
        return;
      }

      try {
        const [providerNames, activeProvider] = await Promise.all([
          invokeProviderCommand<string[]>('list_providers'),
          invokeProviderCommand<string>('get_active_provider'),
        ]);
        const normalizedProviders = providerNames.filter(isProvider);
        const providers = normalizedProviders.length > 0 ? normalizedProviders : [...PROVIDER_IDS];
        const nextProvider = isProvider(activeProvider) ? activeProvider : 'deepseek';
        const statusEntries = await Promise.all(
          providers.map(async (provider) => {
            if (provider === 'ollama') return [provider, true] as const;
            const hasKey = await invokeProviderCommand<boolean>('has_provider_key', { provider });
            return [provider, hasKey] as const;
          }),
        );

        if (!cancelled) {
          const nextStatuses = emptyProviderStatus();
          statusEntries.forEach(([provider, hasKey]) => {
            nextStatuses[provider] = hasKey;
          });
          setAvailableProviders(providers);
          setSelectedProvider(nextProvider);
          setActiveAIProvider(nextProvider);
          setProviderStatuses(nextStatuses);
          setLoadFailed(false);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setIsLoading(false);
        }
      }
    };

    void loadProviderSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedProvider(activeAIProvider);
  }, [activeAIProvider]);

  const handleProviderChange = async (provider: Provider) => {
    if (provider === selectedProvider || isSwitching) return;
    if (webMode && provider !== 'gemini') {
      toast({
        type: 'info',
        title: 'Web mode 仅支持 Gemini',
        description: 'DeepSeek、OpenAI、Anthropic 和 Ollama 需要桌面端。',
      });
      return;
    }

    setIsSwitching(true);
    try {
      await invokeProviderCommand<void>('set_active_provider', { provider });
      setSelectedProvider(provider);
      setActiveAIProvider(provider);
      setKeyInput('');
      toast({ type: 'success', title: `已切换到 ${providerLabel(provider)}` });
    } catch {
      toast({
        type: 'error',
        title: '切换 provider 失败',
        description: '请检查桌面端状态后重试。',
      });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSaveKey = async () => {
    const key = keyInput.trim();
    if (!key || isSavingKey || webMode || selectedProvider === 'ollama') return;

    setIsSavingKey(true);
    try {
      await invokeProviderCommand<void>('set_provider_key', {
        provider: selectedProvider,
        key,
      });
      setProviderStatuses((current) => ({ ...current, [selectedProvider]: true }));
      setKeyInput('');
      toast({
        type: 'success',
        title: `${providerLabel(selectedProvider)} API key 已保存`,
        description: '已写入系统钥匙串；页面不会保留 key 内容。',
      });
    } catch {
      toast({
        type: 'error',
        title: 'API key 保存失败',
        description: '请检查桌面端钥匙串权限后重试。',
      });
    } finally {
      setIsSavingKey(false);
    }
  };

  const selectorOptions = PROVIDER_OPTIONS.filter((option) => availableProviders.includes(option.id));
  const selectedStatus = providerStatuses[selectedProvider];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">AI 设置</h2>
        <p className="text-sm text-text-secondary mt-1">
          选择 AI provider，并在桌面端为各 provider 管理独立的 API key。
        </p>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-4" aria-labelledby="provider-heading">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-accent"><Robot size={20} weight="duotone" /></div>
          <div>
            <h3 id="provider-heading" className="text-sm font-semibold text-text-primary">当前 provider</h3>
            <p className="text-xs text-text-tertiary mt-1">
              桌面端选择会同步到 Rust command；API key 只通过 command 进入系统钥匙串。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="AI provider">
          {selectorOptions.map((option) => {
            const isSelected = option.id === selectedProvider;
            const isWebUnavailable = webMode && option.id !== 'gemini';
            const status = providerStatuses[option.id];
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${option.label}，${isWebUnavailable ? '桌面端可用' : status ? '已配置' : '未配置'}`}
                disabled={isSwitching || isWebUnavailable}
                title={isWebUnavailable ? '该 provider 需要桌面端' : option.description}
                onClick={() => void handleProviderChange(option.id)}
                className={cn(
                  'min-h-16 rounded-[var(--radius-md)] border px-2 py-2 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
                  isSelected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border-subtle bg-bg-secondary text-text-secondary hover:border-text-tertiary/40',
                  isWebUnavailable && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 flex items-center gap-1 text-[11px] text-text-tertiary">
                  {isWebUnavailable
                    ? '桌面端'
                    : webMode && option.id === 'gemini'
                      ? '服务端配置'
                      : option.id === 'ollama'
                        ? '无需 key'
                        : status === null
                          ? '读取中'
                          : status
                            ? '已配置'
                            : '未配置'}
                  {!isWebUnavailable && status && <CheckCircle size={11} weight="fill" className="text-success" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {webMode ? (
        <section className="rounded-[var(--radius-lg)] border border-warning/30 bg-warning/5 p-5 space-y-2" aria-labelledby="web-mode-heading">
          <div className="flex items-center gap-2 text-warning">
            <Warning size={18} weight="duotone" />
            <h3 id="web-mode-heading" className="text-sm font-semibold">Web mode 降级</h3>
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            Web mode 只支持 Gemini。Gemini API key 由服务端的 <code className="font-mono">GEMINI_API_KEY</code> 配置，
            本页面不会读取、保存或显示 key；其他 provider 需要使用桌面端系统钥匙串。
          </p>
        </section>
      ) : selectedProvider === 'ollama' ? (
        <section className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-2" aria-labelledby="ollama-heading">
          <div className="flex items-center gap-2 text-text-primary">
            <Robot size={18} weight="duotone" />
            <h3 id="ollama-heading" className="text-sm font-semibold">Ollama 本地 provider</h3>
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            Ollama 不需要 API key。请确保本机已安装模型并运行 <code className="font-mono">ollama serve</code>，默认通过
            <code className="font-mono"> http://localhost:11434</code> 调用。
          </p>
        </section>
      ) : (
        <section className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-4" aria-labelledby="key-heading">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-accent"><Key size={19} weight="duotone" /></div>
            <div className="min-w-0">
              <h3 id="key-heading" className="text-sm font-semibold text-text-primary">{selectedOption.label} API key</h3>
              <p className="text-xs text-text-tertiary mt-1">
                {isLoading
                  ? '正在读取系统钥匙串状态。'
                  : loadFailed
                    ? '无法读取钥匙串状态，可以直接尝试更新 key。'
                    : selectedStatus
                      ? '已配置。输入新 key 可替换现有值。'
                      : '尚未配置。key 只写入系统钥匙串，不会写入应用文件或持久化状态。'}
              </p>
            </div>
          </div>

          <Input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder={selectedOption.keyPlaceholder}
            autoComplete="new-password"
            aria-label={`${selectedOption.label} API key`}
            disabled={isLoading || isSavingKey}
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-tertiary inline-flex items-center gap-1.5">
              <CheckCircle size={13} weight="fill" className="text-success" />
              只显示配置状态，不显示 key 内容
            </span>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleSaveKey()}
              disabled={!keyInput.trim() || isLoading || isSavingKey}
              loading={isSavingKey}
            >
              {selectedStatus ? '更新 key' : '保存 key'}
            </Button>
          </div>
        </section>
      )}

      {isSwitching && <p className="text-xs text-text-tertiary">正在切换 provider...</p>}
    </div>
  );
}
