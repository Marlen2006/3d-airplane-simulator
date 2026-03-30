import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Sparkles, Cloud, Sky, Float, MeshDistortMaterial } from '@react-three/drei'
import { Suspense, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Airplane from './Airplane'

// Infinite moving sea/ground
function InfiniteSea({ speed = 1.0 }) {
  const meshRef = useRef()
  
  useFrame((state, delta) => {
    if (!meshRef.current) return
    // Scroll the texture coordinates or the mesh itself
    meshRef.current.position.z += delta * speed * 80
    if (meshRef.current.position.z > 50) meshRef.current.position.z = -50
  })

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -15, 0]}>
        <planeGeometry args={[2000, 2000, 10, 10]} />
        <meshStandardMaterial 
          color="#0a1a3a" 
          roughness={0.2} 
          metalness={0.8}
          emissive="#3b82f6"
          emissiveIntensity={0.1}
        />
      </mesh>
      {/* Decorative Grid for scale perception */}
      <gridHelper args={[1000, 50, 0x3b82f6, 0x1d4ed8]} position={[0, -14.9, 0]} />
    </group>
  )
}

function CloudSystem({ speed = 1.0 }) {
  const group = useRef()
  useFrame((state, delta) => {
    if (group.current) {
      // Forward flight: Clouds move past the plane (+Z direction)
      group.current.position.z += delta * speed * 35
      if (group.current.position.z > 60) group.current.position.z = -100
    }
  })

  return (
    <group ref={group}>
      <Cloud opacity={0.5} speed={0.2} width={15} depth={2} segments={20} position={[30, 2, -120]} />
      <Cloud opacity={0.4} speed={0.3} width={20} depth={1.5} segments={20} position={[-40, 5, -150]} />
      <Cloud opacity={0.3} speed={0.4} width={25} depth={1} segments={25} position={[0, -10, -200]} />
      <Cloud opacity={0.5} speed={0.1} width={30} depth={3} segments={30} position={[60, -5, -180]} />
      <Cloud opacity={0.4} speed={0.2} width={20} depth={2} segments={20} position={[-70, 8, -130]} />
    </group>
  )
}

function SpeedLines({ speed = 1.0 }) {
  const ref = useRef()
  const count = 60
  const lines = useMemo(() => [...Array(count)].map(() => ({
    pos: [Math.random() * 40 - 20, Math.random() * 30 - 15, Math.random() * 100 - 150],
    length: Math.random() * 5 + 5,
    speed: Math.random() * 40 + 60
  })), [])

  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.children.forEach((mesh, i) => {
      const line = lines[i]
      mesh.position.z += delta * speed * line.speed
      if (mesh.position.z > 20) mesh.position.z = -150
    })
  })

  return (
    <group ref={ref}>
      {lines.map((line, i) => (
        <mesh key={i} position={line.pos} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.04, 0.04, line.length]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function CameraRig({ yaw, pitch }) {
  const groupRef = useRef()
  
  useFrame((state, delta) => {
    if (!groupRef.current) return
    const targetYaw = (yaw * Math.PI) / 180
    
    // Add slight camera shake at high speed (simulated by nose dive)
    const shake = Math.abs(pitch) > 30 ? (Math.random() - 0.5) * 0.01 : 0
    
    // Chase camera pivot
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, -targetYaw, 0.05)
    
    // Chase camera position (Z=18)
    state.camera.position.lerp(new THREE.Vector3(shake, 4.0 + shake, 18), 0.1)
    state.camera.lookAt(0, 1.0, 0)
  })

  return <group ref={groupRef} />
}

export default function Scene3D({ roll, pitch, yaw, connected }) {
  // Velocity increases when diving (pitch > 0) or climbing (pitch < 0)
  const baseSpeed = 1.5
  const tiltInfluence = Math.abs(roll) / 45 
  const currentSpeed = baseSpeed + tiltInfluence

  return (
    <Canvas
      shadows
      camera={{ position: [0, 4, 15], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 20, 200]} />

      <Suspense fallback={null}>
        <ambientLight intensity={1.2} color="#ffffff" />
        <directionalLight 
          position={[100, 150, 100]} 
          intensity={2.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        <Environment preset="city" />
        <Sky sunPosition={[100, 50, 100]} turbidity={0.1} rayleigh={0.5} />
        
        <InfiniteSea speed={currentSpeed} />
        <CloudSystem speed={currentSpeed} />
        <SpeedLines speed={currentSpeed} />
        
        <Sparkles count={80} scale={[100, 50, 150]} size={4} speed={1.5} color="#ffffff" opacity={0.3} />

        <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
          <Airplane roll={roll} pitch={pitch} yaw={yaw} />
        </Float>

        <pointLight position={[0, -2, 0]} intensity={connected ? 5 : 2} color="#ffffff" distance={20} />
        <CameraRig yaw={yaw} pitch={roll} />
      </Suspense>

      <OrbitControls
        enabled={!connected}
        enableDamping
        dampingFactor={0.05}
        minDistance={10}
        maxDistance={60}
        maxPolarAngle={Math.PI / 1.5}
        autoRotate={!connected}
        autoRotateSpeed={0.3}
      />
    </Canvas>
  )
}
