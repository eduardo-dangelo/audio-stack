import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';

import type { EqFilterType } from '@/src/audio/layerEffects';

const VIEW = 24;
const STROKE = 1.75;

/** Schematic EQ response shapes in a 24×24 viewBox (y-up visual, SVG y-down). */
const TYPE_PATHS: Record<EqFilterType, string> = {
  // Peak bump in the middle
  peaking: 'M 2 16 C 6 16 8 16 10 16 C 12 16 12 6 12 6 C 12 6 12 16 14 16 C 16 16 18 16 22 16',
  // Low shelf: raised left, flat right
  lowshelf: 'M 2 8 C 6 8 8 8 10 8 C 13 8 13 16 16 16 L 22 16',
  // High shelf: flat left, raised right
  highshelf: 'M 2 16 L 8 16 C 11 16 11 8 14 8 C 16 8 18 8 22 8',
  // Low pass: high left, rolls off right
  lowpass: 'M 2 8 L 10 8 C 14 8 16 10 18 14 C 19 16 20 17 22 18',
  // High pass: rolls up from left
  highpass: 'M 2 18 C 4 17 5 16 6 14 C 8 10 10 8 14 8 L 22 8',
  // Notch: flat with center dip
  notch: 'M 2 10 L 8 10 C 10 10 10 18 12 18 C 14 18 14 10 16 10 L 22 10',
};

type Props = {
  type: EqFilterType;
  color: string;
  size?: number;
};

export function EqFilterTypeIcon({ type, color, size = 22 }: Props) {
  const path = useMemo(() => TYPE_PATHS[type], [type]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <Path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
