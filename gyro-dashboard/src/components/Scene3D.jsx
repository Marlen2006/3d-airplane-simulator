import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Sparkles, Cloud, Float, MeshDistortMaterial, useTexture } from '@react-three/drei'
import { Suspense, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Airplane from './Airplane'
import CombatSystem from './CombatSystem'

// Infinite moving terrain (map)
function InfiniteTerrain({ speed = 1.0 }) {
  const meshRef = useRef()
  const texture = useTexture('/textures/terrain.png')
  
  useMemo(() => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(6, 6) 
    texture.anisotropy = 16
  }, [texture])

  useFrame((state, delta) => {
    if (!meshRef.current) return
    texture.offset.y += delta * speed * 0.12 
  })

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -32, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000, 1, 1]} />
        <meshStandardMaterial 
          map={texture}
          roughness={1} 
          metalness={0}
          emissive="#222"
          emissiveIntensity={0.05}
        />
      </mesh>
    </group>
  )
}

function CloudSystem({ speed = 1.0 }) {
  const group = useRef()
  useFrame((state, delta) => {
    if (group.current) {
      group.current.position.z += delta * speed * 30
      if (group.current.position.z > 150) group.current.position.z = -200
    }
  })

  return (
    <group ref={group}>
      <Cloud opacity={0.2} speed={0.4} width={30} depth={2} segments={20} position={[60, 20, -140]} />
      <Cloud opacity={0.15} speed={0.3} width={40} depth={1.5} segments={25} position={[-80, 18, -250]} />
      <Cloud opacity={0.3} speed={0.1} width={35} depth={4} segments={30} position={[0, -5, -300]} />
      <Cloud opacity={0.2} speed={0.2} width={60} depth={3} segments={40} position={[120, 10, -280]} />
    </group>
  )
}

function SpeedLines({ speed = 1.0 }) {
  const ref = useRef()
  const count = 120
  const lines = useMemo(() => [...Array(count)].map(() => ({
    pos: [Math.random() * 100 - 50, Math.random() * 60 - 30, Math.random() * 300 - 300],
    length: Math.random() * 12 + 6,
    speed: Math.random() * 70 + 100
  })), [])

  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.children.forEach((mesh, i) => {
      const line = lines[i]
      mesh.position.z += delta * speed * line.speed
      if (mesh.position.z > 100) mesh.position.z = -300
    })
  })

  return (
    <group ref={ref}>
      {lines.map((line, i) => (
        <mesh key={i} position={line.pos}>
          <boxGeometry args={[0.015, 0.015, line.length]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
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
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, -targetYaw, 0.05)
    
    state.camera.position.lerp(new THREE.Vector3(0, 8.0, 26), 0.08)
    state.camera.lookAt(0, 3.0, 0)
  })

  return <group ref={groupRef} />
}

export default function Scene3D({ 
  roll, pitch, yaw, connected, throttle = 1.0, 
  isFiring = false, onHit 
}) {
  // Speed depends ONLY on the joystick throttle
  const currentSpeed = 2.2 * throttle 

  return (
    <Canvas
      shadows
      camera={{ position: [0, 8, 26], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      {/* Seamless Fog & Background */}
      <color attach="background" args={['#c8e6ff']} />
      <fog attach="fog" args={['#c8e6ff', 20, 450]} />

      <Suspense fallback={null}>
        <ambientLight intensity={2.0} color="#ffffff" />
        <directionalLight 
          position={[200, 400, 100]} 
          intensity={4.0} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        <Environment preset="apartment" />
        
        <InfiniteTerrain speed={currentSpeed} />
        <CloudSystem speed={currentSpeed} />
        <SpeedLines speed={currentSpeed} />
        
        <Sparkles count={150} scale={[250, 150, 300]} size={6} speed={3} color="#ffffff" opacity={0.25} />

        <Float speed={0.8} rotationIntensity={0.01} floatIntensity={0.02}>
          <Airplane roll={roll} pitch={pitch} yaw={yaw} isFiring={isFiring} />
        </Float>

        <CombatSystem isFiring={isFiring} onHit={onHit} />

        <pointLight position={[0, -5, 10]} intensity={connected ? 20 : 5} color="#ffffff" distance={80} />
        <CameraRig yaw={yaw} pitch={roll} />
      </Suspense>

      <OrbitControls
        enabled={!connected}
        enableDamping
        dampingFactor={0.05}
        minDistance={25}
        maxDistance={120}
        maxPolarAngle={Math.PI / 1.7}
        autoRotate={!connected}
        autoRotateSpeed={0.1}
      />
    </Canvas>
  )
}
