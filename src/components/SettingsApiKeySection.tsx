import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Key, Robot, Warning } from '@phosphor-icons/react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/ui/Toast';
import { isTauri, pingProvider, type Provider } from '@/src/lib/api';
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

type ProviderStatusValue = boolean | 'invalid' | null;
type ProviderStatus = Record<Provider, ProviderStatusValue>;

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
  const ollamaModel = useUIStore((state) => state.ollamaModel);
  const setOllamaModel = useUIStore((state) => state.setOllamaModel);
  const [selectedProvider, setSelectedProvider] = useState<Provider>(activeAIProvider);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus>(emptyProviderStatus);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([...PROVIDER_IDS]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [ollamaModelInput, setOllamaModelInput] = useState(ollamaModel);
  const [loadFailed, setLoadFailed] = useState(false);
  const { toast } = useToast();
  const webMode = !isTauri();

  useEffect(() => {
    setOllamaModelInput(ollamaModel);
  }, [ollamaModel]);

  // ponytail: single ping path — handleSaveKey / handleProviderChange / 测试按钮
  // all funnel here so error-classification stays in one place. Reason is the
  // raw AppError Display string (already user-friendly Chinese for Ollama; for
  // cloud providers it's English like "invalid api key" — surfaced verbatim).
  // Returns null on success, error reason string on failure.
  const runPing = async (
    provider: Provider,
    key: string,
    ollamaModelValue?: string,
  ): Promise<string | null> => {
    if (!isTauri()) return 'Web mode 仅支持 Gemini';
    try {
      await pingProvider(
        provider,
        key,
        provider === 'ollama' ? (ollamaModelValue ?? ollamaModel) : undefined,
      );
      return null;
    } catch (error) {
      return typeof error === 'string' ? error : (error as Error).message ?? String(error);
    }
  };

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

      // 切到 Ollama 时立即 ping 一次,验证本地服务 + 模型可用
      if (provider === 'ollama' && isTauri()) {
        setIsPinging(true);
        const pingError = await runPing('ollama', '', ollamaModel);
        setIsPinging(false);
        if (pingError === null) {
          setProviderStatuses((current) => ({ ...current, ollama: true }));
          toast({
            type: 'success',
            title: 'Ollama 在 localhost:11434 可达',
            description: `模型 ${ollamaModel} 已就绪。`,
          });
        } else {
          setProviderStatuses((current) => ({ ...current, ollama: 'invalid' }));
          toast({ type: 'warning', title: 'Ollama 不可用', description: pingError });
        }
      }
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
      // ping 阶段 — keychain 已写入,ping 失败不删除 key(可能是临时网络/配额)
      setIsPinging(true);
      const pingError = await runPing(selectedProvider, key);
      setIsPinging(false);
      if (pingError === null) {
        setProviderStatuses((current) => ({ ...current, [selectedProvider]: true }));
        setKeyInput('');
        toast({
          type: 'success',
          title: `${providerLabel(selectedProvider)} API key 已保存`,
          description: '连通性验证通过。已写入系统钥匙串;页面不会保留 key 内容。',
        });
      } else {
        setProviderStatuses((current) => ({ ...current, [selectedProvider]: 'invalid' }));
        setKeyInput('');
        toast({
          type: 'warning',
          title: `${providerLabel(selectedProvider)} key 已保存但 ping 失败`,
          description: pingError,
        });
      }
    } catch {
      toast({
        type: 'error',
        title: 'API key 保存失败',
        description: '请检查桌面端钥匙串权限后重试。',
      });
    } finally {
      setIsSavingKey(false);
      setIsPinging(false);
    }
  };

  const handleSaveOllamaModel = async () => {
    const trimmed = ollamaModelInput.trim();
    if (!trimmed || isPinging) return;
    setOllamaModel(trimmed);
    setIsPinging(true);
    const pingError = await runPing('ollama', '', trimmed);
    setIsPinging(false);
    if (pingError === null) {
      setProviderStatuses((current) => ({ ...current, ollama: true }));
      toast({
        type: 'success',
        title: 'Ollama 模型名已保存',
        description: `模型 ${trimmed} 已就绪,下次 chat 调用将使用该模型。`,
      });
    } else {
      setProviderStatuses((current) => ({ ...current, ollama: 'invalid' }));
      toast({
        type: 'warning',
        title: '模型名已保存但 ping 失败',
        description: pingError,
      });
    }
  };

  const handleTestOllama = async () => {
    if (isPinging) return;
    setIsPinging(true);
    const pingError = await runPing('ollama', '', ollamaModelInput.trim() || ollamaModel);
    setIsPinging(false);
    if (pingError === null) {
      setProviderStatuses((current) => ({ ...current, ollama: true }));
      toast({
        type: 'success',
        title: 'Ollama 可达',
        description: `模型 ${ollamaModelInput.trim() || ollamaModel} 已就绪。`,
      });
    } else {
      setProviderStatuses((current) => ({ ...current, ollama: 'invalid' }));
      toast({ type: 'error', title: 'Ollama ping 失败', description: pingError });
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
                aria-label={`${option.label}，${isWebUnavailable
                  ? '桌面端可用'
                  : option.id === 'ollama'
                    ? status === 'invalid' ? '不可用' : status === true ? '已就绪' : status === false ? '未配置' : '读取中'
                    : status === 'invalid' ? '配置但不可用' : status === true ? '已配置' : status === false ? '未配置' : '读取中'}`}
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
                        ? (status === null ? '读取中' : status === 'invalid' ? '不可用' : status === true ? '已就绪' : '未配置')
                        : (status === null ? '读取中' : status === 'invalid' ? '配置但不可用' : status === true ? '已配置' : '未配置')}
                  {!isWebUnavailable && status === true && <CheckCircle size={11} weight="fill" className="text-success" />}
                  {!isWebUnavailable && status === 'invalid' && <Warning size={11} weight="fill" className="text-warning" />}
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
        <section className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-4" aria-labelledby="ollama-heading">
          <div className="flex items-center gap-2 text-text-primary">
            <Robot size={18} weight="duotone" />
            <h3 id="ollama-heading" className="text-sm font-semibold">Ollama 本地 provider</h3>
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            Ollama 不需要 API key。请确保已运行 <code className="font-mono">ollama serve</code>，并通过 <code className="font-mono">ollama pull &lt;model&gt;</code> 拉取所需模型。chat 调用走 <code className="font-mono">http://localhost:11434</code>。
          </p>
          <div className="space-y-2">
            <label htmlFor="ollama-model-input" className="text-xs text-text-tertiary">本地模型名</label>
            <div className="flex items-center gap-2">
              <Input
                id="ollama-model-input"
                value={ollamaModelInput}
                onChange={(event) => setOllamaModelInput(event.target.value)}
                placeholder="例如 llama3.2 / my-ornith / qwen2.5"
                aria-label="Ollama 本地模型名"
                disabled={isPinging}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleTestOllama()}
                disabled={isPinging}
                loading={isPinging}
                className="shrink-0"
              >
                测试连接
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleSaveOllamaModel()}
                disabled={!ollamaModelInput.trim() || ollamaModelInput.trim() === ollamaModel || isPinging}
                className="shrink-0"
              >
                保存模型
              </Button>
            </div>
            <p className="text-[11px] text-text-tertiary">
              当前保存: <code className="font-mono">{ollamaModel}</code>。修改后需重新 ping 验证。
            </p>
          </div>
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
                    : selectedStatus === 'invalid'
                      ? 'key 已保存,但 ping 失败。请检查 key 或网络后重新输入。'
                      : selectedStatus === true
                        ? '已配置。输入新 key 可替换现有值。'
                        : selectedStatus === false
                          ? '尚未配置。key 只写入系统钥匙串,不会写入应用文件或持久化状态。'
                          : '正在读取系统钥匙串状态。'}
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
