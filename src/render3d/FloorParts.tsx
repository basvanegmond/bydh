import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide } from 'three';
import type { BufferGeometry } from 'three';
import type { WallOutline } from '@/domain/model/outlines';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Slab } from '@/domain/model/slabs';
import type { CeilingPlane, Floor, Opening, Polygon, Wall } from '@/domain/schema';
import {
  ceilingSurfaceGeometry,
  prismGeometry,
  roomFloorGeometry,
  slabGeometry,
  wallGeometry,
} from './geometry';
import { boxesGeometry, openingParts } from './openings3d';

type Pick3D = (e: ThreeEvent<MouseEvent>) => void;

/** Frees GPU buffers when a geometry is replaced or its mesh unmounts. */
function useDisposed<T extends BufferGeometry>(geometry: T): T {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function RoomFloor({
  room,
  elevation,
  color,
  onPick,
}: {
  room: RoomGeometry;
  elevation: number;
  color: string;
  onPick: Pick3D;
}) {
  const geometry = useDisposed(useMemo(() => roomFloorGeometry(room), [room]));
  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      position-y={elevation / 1000 + 0.003}
      receiveShadow
      onClick={onPick}
    >
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

export function WallMesh({
  floor,
  wall,
  outline,
  base,
  colors,
  onPick,
}: {
  floor: Floor;
  wall: Wall;
  outline: WallOutline;
  base: number;
  colors: [string, string, string];
  onPick: Pick3D;
}) {
  const geometry = useDisposed(
    useMemo(() => wallGeometry(floor, wall, outline, base), [floor, wall, outline, base]),
  );
  return (
    <mesh geometry={geometry} castShadow receiveShadow onClick={onPick}>
      {colors.map((color, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          color={color}
          side={DoubleSide}
          roughness={0.9}
        />
      ))}
    </mesh>
  );
}

/** Frame, leaf, glass and sash bars of one door or window. */
export function OpeningMesh({
  floor,
  wall,
  opening,
  base,
}: {
  floor: Floor;
  wall: Wall;
  opening: Opening;
  base: number;
}) {
  const parts = useMemo(() => openingParts(wall, opening), [wall, opening]);
  const geometries = useDisposed2(
    useMemo(
      () => ({
        frame: boxesGeometry(floor, wall, parts.frame, base),
        leaf: boxesGeometry(floor, wall, parts.leaf, base),
        glass: boxesGeometry(floor, wall, parts.glass, base),
        sash: boxesGeometry(floor, wall, parts.sash, base),
      }),
      [floor, wall, parts, base],
    ),
  );
  return (
    <group>
      <mesh geometry={geometries.frame} castShadow receiveShadow>
        <meshStandardMaterial color={parts.frameColor} roughness={0.6} side={DoubleSide} />
      </mesh>
      {parts.leaf.length > 0 && (
        <mesh geometry={geometries.leaf} castShadow receiveShadow>
          <meshStandardMaterial color={parts.leafColor} roughness={0.7} />
        </mesh>
      )}
      {parts.glass.length > 0 && (
        <mesh geometry={geometries.glass}>
          <meshStandardMaterial
            color="#a9cde6"
            transparent
            opacity={0.35}
            roughness={0.1}
            depthWrite={false}
          />
        </mesh>
      )}
      {parts.sash.length > 0 && (
        <mesh geometry={geometries.sash}>
          <meshStandardMaterial color={parts.frameColor} roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}

function useDisposed2<T extends Record<string, BufferGeometry>>(geometries: T): T {
  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g.dispose();
    },
    [geometries],
  );
  return geometries;
}

/** One slab, its top at the floor level. */
export function SlabMesh({
  slab,
  elevation,
  thickness,
  color,
}: {
  slab: Slab;
  elevation: number;
  thickness: number;
  color: string;
}) {
  const geometry = useDisposed(useMemo(() => slabGeometry(slab, thickness), [slab, thickness]));
  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      position-y={(elevation - thickness) / 1000}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/** The underside of one ceiling plane over one room. */
export function CeilingMesh({
  plane,
  polygon,
  elevation,
  color,
}: {
  plane: CeilingPlane;
  polygon: Polygon;
  elevation: number;
  color: string;
}) {
  const geometry = useDisposed(
    useMemo(() => ceilingSurfaceGeometry(plane, polygon, elevation), [plane, polygon, elevation]),
  );
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} side={DoubleSide} roughness={0.95} />
    </mesh>
  );
}

/** One stair step: a block from the lower floor level up to the step top. */
export function StepMesh({
  polygon,
  bottom,
  top,
  color,
}: {
  polygon: Polygon;
  bottom: number;
  top: number;
  color: string;
}) {
  const geometry = useDisposed(useMemo(() => prismGeometry(polygon, bottom, top), [polygon, bottom, top]));
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} side={DoubleSide} roughness={0.8} />
    </mesh>
  );
}
