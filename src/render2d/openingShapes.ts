import type { Opening } from '@/domain/schema';

/*
 * Pure 2D symbol geometry for openings. Shapes are in the opening's local frame, in mm:
 * origin at the opening centre on the wall axis, +x along the wall (start node to end node),
 * +y to the wall's left. Door `hinge: 'left'` puts the hinge at the start end (-x) and
 * `opensTo: 'left'` swings the leaf towards +y.
 */

export type OpeningShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; dashed?: boolean; thin?: boolean }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; dashed?: boolean }
  | { kind: 'arc'; d: string };

export interface WallSides {
  /** Wall extent to the left of the axis (>= 0). */
  left: number;
  /** Wall extent to the right of the axis (>= 0). */
  right: number;
}

const LEAF_THICKNESS = 40;
const SASH_MARGIN = 40;

const line = (x1: number, y1: number, x2: number, y2: number, extra?: { thin?: boolean }): OpeningShape => ({
  kind: 'line',
  x1,
  y1,
  x2,
  y2,
  ...extra,
});

/** Quarter-circle arc around a hinge, from the open leaf tip to the closed leaf end. */
function quarterArc(hingeX: number, radius: number, sideSign: 1 | -1, hingeAtStart: boolean): OpeningShape {
  const endX = hingeAtStart ? hingeX + radius : hingeX - radius;
  // SVG sweep 1 = increasing angle in user space (which the plan group mirrors consistently).
  const sweep = sideSign > 0 === hingeAtStart ? 0 : 1;
  const d = `M${hingeX} ${sideSign * radius}A${radius} ${radius} 0 0 ${sweep} ${endX} 0`;
  return { kind: 'arc', d };
}

function swingLeaf(hingeX: number, length: number, sideSign: 1 | -1, hingeAtStart: boolean): OpeningShape[] {
  return [line(hingeX, 0, hingeX, sideSign * length), quarterArc(hingeX, length, sideSign, hingeAtStart)];
}

function doorShapes(
  spec: Extract<Opening['spec'], { type: 'door' }>,
  w: number,
  sides: WallSides,
): OpeningShape[] {
  const half = w / 2;
  const hingeAtStart = spec.hinge === 'left';
  const sideSign = spec.opensTo === 'left' ? 1 : -1;
  const hingeX = hingeAtStart ? -half : half;
  switch (spec.operation) {
    case 'swing':
      return swingLeaf(hingeX, w, sideSign, hingeAtStart);
    case 'double-swing':
      return [...swingLeaf(-half, half, sideSign, true), ...swingLeaf(half, half, sideSign, false)];
    case 'sliding': {
      // Leaf drawn half open on the wall face of the open side; the track runs past the opening.
      const face = sideSign > 0 ? sides.left : -sides.right;
      const y = sideSign > 0 ? face : face - LEAF_THICKNESS;
      const x = hingeAtStart ? -w : 0;
      const trackFrom = hingeAtStart ? -w : -half;
      const trackTo = hingeAtStart ? half : w;
      return [
        { kind: 'rect', x, y, width: w, height: LEAF_THICKNESS },
        line(trackFrom, face, trackTo, face, { thin: true }),
      ];
    }
    case 'pocket':
      // The leaf slides into the wall: shown dashed, inside the wall thickness.
      return [
        {
          kind: 'rect',
          x: hingeAtStart ? -w : 0,
          y: -LEAF_THICKNESS / 2,
          width: w,
          height: LEAF_THICKNESS,
          dashed: true,
        },
      ];
    default:
      return [];
  }
}

function windowShapes(
  spec: Extract<Opening['spec'], { type: 'window' }>,
  w: number,
  sides: WallSides,
): OpeningShape[] {
  const half = w / 2;
  const mid = (sides.left - sides.right) / 2;
  const y = [-sides.right, mid, sides.left] as const;
  if (spec.operation === 'sliding') {
    const pane = (x0: number, yy: number): OpeningShape => ({
      kind: 'rect',
      x: x0,
      y: yy - LEAF_THICKNESS / 2,
      width: half + SASH_MARGIN,
      height: LEAF_THICKNESS,
    });
    return [
      line(-half, y[0], half, y[0]),
      line(-half, y[2], half, y[2]),
      pane(-half, mid - 25),
      pane(-SASH_MARGIN, mid + 25),
    ];
  }
  const shapes = y.map((yy) => line(-half, yy, half, yy));
  if (spec.operation === 'casement' || spec.operation === 'tilt-turn' || spec.operation === 'top-hung') {
    // Sash line: the opening part of the frame, between the glass line and the left face.
    const sashY = (mid + sides.left) / 2;
    const hingeAtStart = (spec.hinge ?? 'left') === 'left';
    const x0 =
      spec.operation === 'top-hung' ? -half + SASH_MARGIN : hingeAtStart ? -half : -half + SASH_MARGIN;
    const x1 = spec.operation === 'top-hung' ? half - SASH_MARGIN : hingeAtStart ? half - SASH_MARGIN : half;
    shapes.push(line(x0, sashY, x1, sashY, { thin: true }));
  }
  return shapes;
}

/** All lines, rectangles and arcs that make up the 2D symbol of an opening. */
export function openingShapes(opening: Opening, sides: WallSides): OpeningShape[] {
  return opening.spec.type === 'door'
    ? doorShapes(opening.spec, opening.width, sides)
    : windowShapes(opening.spec, opening.width, sides);
}
