import { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/ui/Toast';
import { hasAPIKey, setAPIKey } from '@/src/lib/api';

export function SettingsApiKeySection() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    hasAPIKey().then(setHasKey).catch(() => setHasKey(false));
  }, []);

  const handleSave = async () => {
    if (!input.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await setAPIKey(input.trim());
      setHasKey(true);
      setInput('');
      toast({
        type: 'success',
        title: 'API key 已保存',
        description: '存储于系统钥匙串,重启后依然有效',
      });
    } catch (e) {
      toast({
        type: 'error',
        title: '保存失败',
        description: (e as Error).message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state — render nothing until hasAPIKey resolves
  if (hasKey === null) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-text-primary">隐私与安全</h2>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-text-primary">DeepSeek API Key</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {hasKey
              ? 'API key is set. Update below to replace.'
              : 'Stored in OS keychain. Never written to app files.'}
          </p>
        </div>

        <Input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="DeepSeek API key(sk-...)"
        />

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!input.trim() || isSaving}
        >
          {hasKey ? 'Update key' : 'Save key'}
        </Button>
      </div>
    </div>
  );
}
