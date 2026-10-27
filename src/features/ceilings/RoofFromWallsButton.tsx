import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { addRoofFromWalls } from './actions';

export function RoofFromWallsButton() {
  const { t } = useTranslation();
  const [empty, setEmpty] = useState(false);
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        size="sm"
        data-testid="roof-from-walls"
        onClick={() => setEmpty(addRoofFromWalls() === 0)}
      >
        {t('ceilings.roofFromWalls')}
      </Button>
      {empty && (
        <p className="text-xs text-destructive" role="status" data-testid="roof-from-walls-hint">
          {t('ceilings.roofFromWallsEmpty')}
        </p>
      )}
    </div>
  );
}
