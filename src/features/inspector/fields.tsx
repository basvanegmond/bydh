import { useState } from 'react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

interface CommitInputProps {
  id: string;
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  inputMode?: 'decimal' | 'text';
  placeholder?: string;
  testId?: string;
}

/**
 * Text input that commits on Enter or blur, so typing creates one undo step, not one per key.
 * Re-keyed by the caller when the underlying value changes from elsewhere.
 */
export function CommitInput({
  id,
  value,
  onCommit,
  disabled,
  inputMode = 'text',
  placeholder,
  testId,
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Input
      id={id}
      value={draft}
      disabled={disabled}
      inputMode={inputMode}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="h-8"
    />
  );
}
