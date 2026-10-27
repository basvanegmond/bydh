import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { DEFAULT_WALL_COLOR, findMaterial } from '@/data/materials';
import { boundingBox } from '@/domain/geometry/polygon';
import { floorGeometry } from '@/domain/model/floorGeometry';
import { ceilingSlabThickness } from '@/domain/model/floors';
import { mainBuilding, orderedFloors, resolveFloor } from '@/domain/model/project';
import { floorSlabs } from '@/domain/model/slabs';
import { stairGeometry } from '@/domain/model/stairs';
import { floorElevations } from '@/domain/schema';
import type { Building, Floor, Project, Stair } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import type { Selection } from '@/store/viewStore';
import { CeilingMesh, OpeningMesh, RoomFloor, SlabMesh, StepMesh, WallMesh } from './FloorParts';
import { ceilingPlanePieces } from './geometry';
import { visibleFloorIds } from './stack';

const CAP_COLOR = '#e6e1d8';
const SLAB_COLOR = '#c9c4ba';
const STAIR_COLOR = '#b9a88d';
const SELECTED = '#3b82f6';

interface FloorModelProps {
  floor: Floor;
  building: Building;
  elevation: number;
  project: Project;
  selection: Selection;
}

function FloorModel({ floor, building, elevation, project, selection }: FloorModelProps) {
  const { outlines, rooms } = useMemo(() => floorGeometry(floor), [floor]);
  const ceilingSlabMm = ceilingSlabThickness(building, floor.id);
  // Only stairs that arrive here and cut a void affect the slabs; a stable key keeps unrelated stair
  // edits (and dragging other stairs) from rebuilding them.
  const voidStairsKey = JSON.stringify(
    Object.values(building.stairs).filter((s) => s.toFloorId === floor.id && s.cutsVoid),
  );
  const voidStairs = useMemo(() => JSON.parse(voidStairsKey) as Stair[], [voidStairsKey]);
  const slabs = useMemo(() => floorSlabs(floor, voidStairs), [floor, voidStairs]);
  const ceilingPieces = useMemo(
    () =>
      Object.values(floor.ceilingPlanes).flatMap((plane) =>
        Object.values(rooms).flatMap((room) =>
          ceilingPlanePieces(plane, floor, room.polygon, ceilingSlabMm).map((polygon, i) => ({
            key: `${plane.id}-${room.roomId}-${i}`,
            plane,
            polygon,
            roomId: room.roomId,
          })),
        ),
      ),
    [floor, rooms, ceilingSlabMm],
  );
  const { select, setActiveFloor } = useViewStore.getState();

  const pick = (e: ThreeEvent<MouseEvent>, kind: 'wall' | 'room', id: string) => {
    e.stopPropagation();
    setActiveFloor(floor.id);
    select({ kind, id });
  };

  return (
    <group>
      {slabs.map((slab, i) => (
        <SlabMesh
          key={i}
          slab={slab}
          elevation={elevation}
          thickness={floor.slabThickness}
          color={SLAB_COLOR}
        />
      ))}
      {Object.values(rooms).map((room) => {
        const color =
          findMaterial(project, floor.rooms[room.roomId]?.floorFinish.materialId)?.color ?? '#d9cbb5';
        const selected = selection?.kind === 'room' && selection.id === room.roomId;
        return (
          <RoomFloor
            key={room.roomId}
            room={room}
            elevation={elevation}
            color={selected ? SELECTED : color}
            onPick={(e) => pick(e, 'room', room.roomId)}
          />
        );
      })}
      {Object.values(outlines).map((outline) => {
        const wall = floor.walls[outline.wallId];
        if (!wall) return null;
        const selected = selection?.kind === 'wall' && selection.id === wall.id;
        const colors: [string, string, string] = selected
          ? [SELECTED, SELECTED, SELECTED]
          : [
              wall.sides.right.color ?? DEFAULT_WALL_COLOR,
              wall.sides.left.color ?? DEFAULT_WALL_COLOR,
              CAP_COLOR,
            ];
        return (
          <WallMesh
            key={wall.id}
            floor={floor}
            wall={wall}
            outline={outline}
            base={elevation}
            colors={colors}
            ceilingSlabMm={ceilingSlabMm}
            onPick={(e) => pick(e, 'wall', wall.id)}
          />
        );
      })}
      {Object.values(floor.openings).map((opening) => {
        const wall = floor.walls[opening.wallId];
        return wall ? (
          <OpeningMesh key={opening.id} floor={floor} wall={wall} opening={opening} base={elevation} />
        ) : null;
      })}
      {ceilingPieces.map(({ key, plane, polygon, roomId }) => (
        <CeilingMesh
          key={key}
          plane={plane}
          polygon={polygon}
          elevation={elevation}
          color={floor.rooms[roomId]?.ceilingColor ?? '#ffffff'}
        />
      ))}
    </group>
  );
}

/** A stair as solid steps rising from the lower floor level to the upper one. */
function StairModel({ stair, from, to }: { stair: Stair; from: number; to: number }) {
  const { steps } = useMemo(() => stairGeometry(stair), [stair]);
  const riser = (to - from) / Math.max(1, steps.length);
  return (
    <group>
      {steps.map((polygon, i) => (
        <StepMesh key={i} polygon={polygon} bottom={from} top={from + riser * (i + 1)} color={STAIR_COLOR} />
      ))}
    </group>
  );
}

/** Points the camera at the house when a project or floor is opened (not on every edit). */
function CameraRig({ project }: { project: Project }) {
  const controls = useThree((s) => s.controls) as unknown as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const projectId = project.id;
  const variantId = project.activeVariantId;

  useEffect(() => {
    const nodes = orderedFloors(useProjectStore.getState().project).flatMap((f) =>
      Object.values(f.wallNodes).map((n) => n.position),
    );
    const box = boundingBox(nodes);
    const cx = box ? (box.min.x + box.max.x) / 2000 : 0;
    const cz = box ? -(box.min.y + box.max.y) / 2000 : 0;
    const span = box ? Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 1000 : 10;
    const distance = Math.max(8, span * 1.4);
    camera.position.set(cx + distance * 0.6, distance * 0.8, cz + distance * 0.8);
    controls?.target.set(cx, 0, cz);
    controls?.update();
    invalidate();
  }, [projectId, variantId, camera, controls, invalidate]);
  return null;
}

/**
 * The 3D view of the active variant: every floor of the house, stacked at its elevation.
 * Loaded as a separate chunk; renders on demand. Axes: x = plan X/1000, z = −plan Y/1000, y up.
 */
export default function Scene3D() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const selection = useViewStore((s) => s.selection);
  const stackMode = useViewStore((s) => s.stackMode);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const floors = orderedFloors(project);
  const building = mainBuilding(project);
  const elevations = useMemo(() => (building ? floorElevations(building) : {}), [building]);
  const visible = visibleFloorIds(
    floors.map((f) => f.id),
    resolveFloor(project, activeFloorId)?.id ?? null,
    stackMode,
  );

  return (
    <Canvas
      data-testid="scene-3d"
      aria-label={t('viewer3d.label')}
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 10, 14], fov: 45, near: 0.1, far: 500 }}
      onPointerMissed={() => useViewStore.getState().select(null)}
    >
      <color attach="background" args={['#e9eef3']} />
      <hemisphereLight args={['#ffffff', '#b9c4a8', 0.9]} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#d7dccf" />
      </mesh>
      <Grid
        position={[0, 0.001, 0]}
        args={[120, 120]}
        cellSize={0.5}
        sectionSize={5}
        cellColor="#c3c9bd"
        sectionColor="#9aa392"
        fadeDistance={80}
        infiniteGrid
      />
      {building &&
        floors
          .filter((floor) => visible.has(floor.id))
          .map((floor) => (
            <FloorModel
              key={floor.id}
              floor={floor}
              building={building}
              elevation={elevations[floor.id] ?? 0}
              project={project}
              selection={selection}
            />
          ))}
      {building &&
        Object.values(building.stairs)
          .filter((s) => visible.has(s.fromFloorId) || visible.has(s.toFloorId))
          .map((stair) => (
            <StairModel
              key={stair.id}
              stair={stair}
              from={elevations[stair.fromFloorId] ?? 0}
              to={elevations[stair.toFloorId] ?? 0}
            />
          ))}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={150} />
      <CameraRig project={project} />
    </Canvas>
  );
}
