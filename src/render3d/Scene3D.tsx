import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { DoubleSide } from 'three';
import { useTranslation } from 'react-i18next';
import { DEFAULT_WALL_COLOR, findMaterial } from '@/data/materials';
import { boundingBox } from '@/domain/geometry/polygon';
import { computeWallOutlines } from '@/domain/model/outlines';
import { orderedFloors } from '@/domain/model/project';
import { computeRoomGeometry } from '@/domain/model/rooms';
import type { WallOutline } from '@/domain/model/outlines';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Floor, Project } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import type { Selection } from '@/store/viewStore';
import { roomFloorGeometry, wallGeometry } from './geometry';

const CAP_COLOR = '#e6e1d8';
const SELECTED = '#3b82f6';

function RoomFloor({
  room,
  elevation,
  color,
  onPick,
}: {
  room: RoomGeometry;
  elevation: number;
  color: string;
  onPick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geometry = useMemo(() => roomFloorGeometry(room), [room]);
  // Free GPU buffers when the geometry is replaced or unmounted.
  useEffect(() => () => geometry.dispose(), [geometry]);
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

function WallMesh({
  outline,
  base,
  height,
  colors,
  onPick,
}: {
  outline: WallOutline;
  base: number;
  height: number;
  colors: [string, string, string];
  onPick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geometry = useMemo(() => wallGeometry(outline, base, height), [outline, base, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
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

function FloorModel({ floor, project, selection }: { floor: Floor; project: Project; selection: Selection }) {
  const outlines = useMemo(() => computeWallOutlines(floor), [floor]);
  const rooms = useMemo(() => computeRoomGeometry(floor), [floor]);
  const { select, setActiveFloor } = useViewStore.getState();

  const pick = (e: ThreeEvent<MouseEvent>, kind: 'wall' | 'room', id: string) => {
    e.stopPropagation();
    setActiveFloor(floor.id);
    select({ kind, id });
  };

  return (
    <group>
      {Object.values(rooms).map((room) => {
        const color =
          findMaterial(project, floor.rooms[room.roomId]?.floorFinish.materialId)?.color ?? '#d9cbb5';
        const selected = selection?.kind === 'room' && selection.id === room.roomId;
        return (
          <RoomFloor
            key={room.roomId}
            room={room}
            elevation={floor.elevation}
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
            outline={outline}
            base={floor.elevation}
            height={wall.height ?? floor.height}
            colors={colors}
            onPick={(e) => pick(e, 'wall', wall.id)}
          />
        );
      })}
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
  const floors = orderedFloors(project);

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
      {floors.map((floor) => (
        <FloorModel key={floor.id} floor={floor} project={project} selection={selection} />
      ))}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={150} />
      <CameraRig project={project} />
    </Canvas>
  );
}
