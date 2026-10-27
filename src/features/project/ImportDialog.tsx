import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appendVariantsInto } from '@/domain/io/merge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { importProjectJson } from '@/storage/projectFiles';
import type { ImportMode } from '@/storage/projectFiles';
import { openNewProject, repository } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';
import { useImportStore } from './importStore';

/** Pick a .json file, then choose: open as a new project or add its variants (ADR 0003). */
export function ImportDialog() {
  const { t } = useTranslation();
  const open = useImportStore((s) => s.open);
  const projectName = useProjectStore((s) => s.project.name);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    useImportStore.setState({ open: false });
    setFile(null);
    setMessage(null);
  };

  const run = async (mode: ImportMode) => {
    if (!file) return;
    const store = useProjectStore.getState();
    const result = await importProjectJson(
      file.text,
      repository,
      mode,
      store.project,
      t('variant.importedSuffix'),
    );
    if (!result.ok) {
      setMessage(
        t('import.failed', { message: [result.message, ...(result.issues ?? []).slice(0, 3)].join(' ') }),
      );
      return;
    }
    if (mode === 'new-project') await openNewProject(result.project);
    else {
      // Merge into the live draft (not the pre-await snapshot) and only add new entries.
      const suffix = t('variant.importedSuffix');
      store.edit('Import variants', (draft) => void appendVariantsInto(draft, result.imported, suffix));
    }
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="sm:max-w-md" data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.description')}</DialogDescription>
        </DialogHeader>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          data-testid="import-file"
          className="text-sm"
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            setMessage(null);
            setFile(picked ? { name: picked.name, text: await picked.text() } : null);
          }}
        />
        {message && (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
        <div className="grid gap-2">
          <Button disabled={!file} onClick={() => void run('new-project')} data-testid="import-as-new">
            {t('import.asNew')}
          </Button>
          <p className="-mt-1 text-xs text-muted-foreground">{t('import.asNewHint')}</p>
          <Button
            variant="outline"
            disabled={!file}
            onClick={() => void run('add-variants')}
            data-testid="import-as-variants"
          >
            {t('import.asVariants', { name: projectName })}
          </Button>
          <p className="-mt-1 text-xs text-muted-foreground">{t('import.asVariantsHint')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
