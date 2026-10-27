import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { useTranslation } from 'react-i18next';

/**
 * Empty 3D scene: ground, grid, sun and sky light. Loaded as a separate chunk so the 2D editor
 * starts fast. Renders on demand (only when the camera or scene changes) to save laptop battery.
 * Axes: three.js x = plan X / 1000, z = -plan Y / 1000, y = up (metres).
 */
export default function Scene3D() {
  const { t } = useTranslation();
  return (
    <Canvas
      data-testid="scene-3d"
      aria-label={t('viewer3d.label')}
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 10, 14], fov: 45, near: 0.1, far: 500 }}
    >
      <color attach="background" args={['#e9eef3']} />
      <hemisphereLight args={['#ffffff', '#b9c4a8', 0.9]} />
      <directionalLight position={[10, 18, 6]} intensity={1.4} castShadow shadow-mapSize={[2048, 2048]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#d7dccf" />
      </mesh>
      <Grid
        position={[0, 0.002, 0]}
        args={[60, 60]}
        cellSize={0.5}
        sectionSize={5}
        cellColor="#c3c9bd"
        sectionColor="#9aa392"
        fadeDistance={60}
        infiniteGrid
      />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={120} />
    </Canvas>
  );
}
