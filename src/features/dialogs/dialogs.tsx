import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { closeDialog as close, useDialogStore } from './dialogStore';
import type { DialogRequest } from './dialogStore';

function PromptBody({ request }: { request: Extract<DialogRequest, { kind: 'prompt' }> }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(request.initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    request.resolve(value.trim() || null);
    close();
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="prompt-input" className="sr-only">
          {request.title}
        </Label>
        <Input id="prompt-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" data-testid="prompt-ok">
          {t('common.ok')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Renders whichever prompt or confirm is pending. Mount once near the app root. */
export function DialogHost() {
  const { t } = useTranslation();
  const request = useDialogStore((s) => s.request);
  const cancel = () => {
    if (request?.kind === 'prompt') request.resolve(null);
    if (request?.kind === 'confirm') request.resolve(false);
    close();
  };
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="sm:max-w-md">
        {request?.kind === 'prompt' && <PromptBody key={request.title} request={request} />}
        {request?.kind === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription>{request.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={cancel}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                data-testid="confirm-ok"
                onClick={() => {
                  request.resolve(true);
                  close();
                }}
              >
                {t('common.ok')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
