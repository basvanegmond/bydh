import { useTranslation } from 'react-i18next';
import { CommitInput, Field } from '@/features/inspector/fields';
import { cmToMmOrZero, mmToCm } from '@/features/inspector/units';
import { useViewStore } from '@/store/viewStore';
import { parseSlope } from './slope';
import { RoofFromWallsButton } from './RoofFromWallsButton';

/** Tool options for the ceiling tool: defaults for the next plane and the roof-from-walls button. */
export function CeilingOptions() {
  const { t } = useTranslation();
  const defaults = useViewStore((s) => s.ceilingDefaults);
  const setDefault = useViewStore((s) => s.setCeilingDefault);
  return (
    <div
      className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-end gap-2 rounded-md bg-background/95 px-2 py-1 text-xs shadow ring-1 ring-border"
      data-testid="ceiling-options"
    >
      <span className="self-center font-medium">{t('ceilings.defaults.title')}</span>
      <div className="w-24">
        <Field label={t('ceilings.kneeHeight')} htmlFor="default-ceiling-knee">
          <CommitInput
            key={`knee-${defaults.kneeHeight}`}
            id="default-ceiling-knee"
            inputMode="decimal"
            value={mmToCm(defaults.kneeHeight)}
            testId="default-ceiling-knee"
            onCommit={(v) => {
              const mm = cmToMmOrZero(v);
              if (mm !== null) setDefault({ kneeHeight: mm });
            }}
          />
        </Field>
      </div>
      <div className="w-24">
        <Field label={t('ceilings.slope')} htmlFor="default-ceiling-slope">
          <CommitInput
            key={`slope-${defaults.slopeDeg}`}
            id="default-ceiling-slope"
            inputMode="decimal"
            value={String(defaults.slopeDeg).replace('.', ',')}
            testId="default-ceiling-slope"
            onCommit={(v) => {
              const deg = parseSlope(v);
              if (deg !== null) setDefault({ slopeDeg: deg });
            }}
          />
        </Field>
      </div>
      <RoofFromWallsButton />
    </div>
  );
}
