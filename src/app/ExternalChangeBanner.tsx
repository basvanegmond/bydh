import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { keepLocalVersion, reloadFromStorage, saveLocalAsCopy, usePersistence } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';

/** Non-destructive warning when another tab saved the open project; autosave stays paused. */
export function ExternalChangeBanner() {
  const { t } = useTranslation();
  const changed = usePersistence((s) => s.externalChange);
  const name = useProjectStore((s) => s.project.name);
  if (!changed) return null;
  return (
    <div
      role="alert"
      data-testid="external-change-banner"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center gap-2 border-t bg-background p-3 text-sm shadow-lg"
    >
      <span className="mr-auto">{t('sync.changedElsewhere')}</span>
      <Button size="sm" onClick={() => void reloadFromStorage()}>
        {t('sync.reload')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => void saveLocalAsCopy(t('sync.copyName', { name }))}>
        {t('sync.saveCopy')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => void keepLocalVersion()}>
        {t('sync.keepMine')}
      </Button>
    </div>
  );
}
