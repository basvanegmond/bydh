import { useTranslation } from 'react-i18next';
import { formatLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import { scaleBarLength } from './viewport';
import type { Viewport } from './viewport';

export function ScaleBar({ view }: { view: Viewport }) {
  const { t } = useTranslation();
  const lengthMm = scaleBarLength(view.scale);
  const widthPx = lengthMm * view.scale;
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground"
      aria-label={t('plan.scale')}
      data-testid="scale-bar"
    >
      <div className="h-1.5 border-x-2 border-b-2 border-foreground/70" style={{ width: widthPx }} />
      <div className="mt-0.5 tabular-nums">{formatLength(lengthMm, 'm', currentLocale())}</div>
    </div>
  );
}
