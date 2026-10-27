import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { createProject } from '@/domain/schema';
import { openNewProject, openProject, refreshProjectList, usePersistence } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';

/** Shown when rendering crashes (e.g. a corrupt project): lets the user leave the broken project. */
export function CrashFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  const projects = usePersistence((s) => s.projects);
  const currentId = useProjectStore((s) => s.project.id);
  useEffect(() => {
    void refreshProjectList().catch(() => undefined);
  }, []);
  const others = projects.filter((p) => p.id !== currentId);

  const recover = async (action: () => Promise<void>) => {
    try {
      await action();
      resetErrorBoundary();
    } catch {
      /* stay on the fallback; the error is already shown */
    }
  };

  return (
    <div role="alert" data-testid="crash-fallback" className="mx-auto flex max-w-lg flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{t('crash.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('crash.description')}</p>
      <div className="grid gap-2">
        {others.length === 0 && <p className="text-sm">{t('crash.noProjects')}</p>}
        {others.map((p) => (
          <Button key={p.id} variant="outline" onClick={() => void recover(() => openProject(p.id))}>
            {t('crash.openOther', { name: p.name })}
          </Button>
        ))}
        <Button
          onClick={() =>
            void recover(() =>
              openNewProject(
                createProject(t('app.defaultProjectName'), {
                  variant: t('app.defaultVariantName'),
                  building: t('app.defaultBuildingName'),
                }),
              ),
            )
          }
          data-testid="crash-start-new"
        >
          {t('crash.startNew')}
        </Button>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary>{t('crash.details')}</summary>
        <pre className="whitespace-pre-wrap">{error instanceof Error ? error.message : String(error)}</pre>
      </details>
    </div>
  );
}
