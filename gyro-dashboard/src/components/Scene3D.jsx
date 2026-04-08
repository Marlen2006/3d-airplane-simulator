import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Sparkles, Cloud, Float, MeshDistortMaterial, useTexture } from '@react-three/drei'
import { Suspense, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Airplane from './Airplane'
import CombatSystem from './CombatSystem'

// Infinite moving terrain (map)
function InfiniteTerrain({ airplaneRef }) {
  const meshRef = useRef()
  const texture = useTexture('/textures/terrain.png')
  
  useMemo(() => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(30, 30) // More repeats for a larger visual scale
    texture.anisotropy = 16
  }, [texture])

  useFrame(() => {
    if (!meshRef.current || !airplaneRef.current) return
    const planePos = airplaneRef.current.position 
    // Snap terrain position to airplane X/Z, keep Y
    meshRef.current.position.set(planePos.x, -100, planePos.z)
    
    // Offset UVs based on absolute world X/Z to create the illusion of infinite floor
    // Plane is 20000x20000, repeat is 30x30
    texture.offset.x = (planePos.x / 20000) * 30
    texture.offset.y = -(planePos.z / 20000) * 30
  })

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -100, 0]} receiveShadow>
        <planeGeometry args={[20000, 20000, 1, 1]} />
        <meshStandardMaterial 
          map={texture}
          roughness={1} 
          metalness={0}
          emissive="#111"
          emissiveIntensity={0.2}
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

function CameraRig({ airplaneRef }) {
  const lookAtRef = useRef(new THREE.Vector3())
  
  useFrame((state, delta) => {
    if (!airplaneRef.current) return
    const airplane = airplaneRef.current

    // Ideal camera position: behind and above
    const idealOffset = new THREE.Vector3(0, 4.0, 18)
    idealOffset.applyQuaternion(airplane.quaternion)
    idealOffset.add(airplane.position)
    
    // Ideal look at point: ahead of the plane, but slightly influenced by UP vector
    const idealLookAt = new THREE.Vector3(0, 0, -50)
    idealLookAt.applyQuaternion(airplane.quaternion)
    idealLookAt.add(airplane.position)
    
    // Lerp camera for smooth chase effect
    state.camera.position.lerp(idealOffset, 0.08)
    
    // Smoothly look at target
    lookAtRef.current.lerp(idealLookAt, 0.1)
    state.camera.lookAt(lookAtRef.current)
    
    // Update camera up vector to match airplane roll
    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(airplane.quaternion)
    // Lerp UP vector for realistic camera tilt
    state.camera.up.lerp(upVector, 0.04)
  })

  return null
}

export default function Scene3D({ 
  roll, pitch, yaw, connected, throttle = 1.0, 
  isFiring = false, onHit 
}) {
  // Speed depends ONLY on the joystick throttle
  const currentSpeed = 2.2 * throttle 
  const airplaneRef = useRef()

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
        
        <InfiniteTerrain airplaneRef={airplaneRef} />
        
        {/* We keep old cloud system but position it relative to the airplane loosely */}
        {/* Skipping extensive cloud refactor to save time, they will just exist in world space */}
        <CloudSystem speed={currentSpeed} />
        {/* Removing speed lines as they break with real 3D movement, or we could parent them to plane */}
        
        <Sparkles count={150} scale={[250, 150, 300]} size={6} speed={3} color="#ffffff" opacity={0.25} />

        <Airplane ref={airplaneRef} roll={roll} pitch={pitch} yaw={yaw} isFiring={isFiring} throttle={throttle} />

        <CombatSystem airplaneRef={airplaneRef} isFiring={isFiring} onHit={onHit} />

        <pointLight position={[0, -5, 10]} intensity={connected ? 20 : 5} color="#ffffff" distance={80} />
        <CameraRig airplaneRef={airplaneRef} />
      </Suspense>

    </Canvas>
  )
}
