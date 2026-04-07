import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

// Preload the model
useGLTF.preload('/models/f22_raptor.glb')

const Airplane = forwardRef(({ roll = 0, pitch = 0, yaw = 0, isFiring = false }, ref) => {
  const groupRef = useRef()
  const modelRef = useRef()
  const timeRef = useRef(0)
  
  // Expose the groupRef to the parent via forwardRef
  useImperativeHandle(ref, () => groupRef.current)

  // Load the F-22 Raptor model
  const { scene } = useGLTF('/models/f22_raptor.glb')

  // Clone scene to avoid issues if multiple instances are used
  const model = useMemo(() => scene.clone(), [scene])

  useEffect(() => {
    if (model) {
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
          if (child.material) {
            child.material.metalness = 0.9 // Higher metalness for stealth look
            child.material.roughness = 0.2
          }
        }
      })
    }
  }, [model])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    timeRef.current += delta

    // Remapped Control Logic:
    // Sensor Roll -> Nose Pitch
    // Sensor Pitch -> Yaw Turn
    
    // Sensitivity and normalization
    const PITCH_SENSITIVITY = 0.5 
    const YAW_SENSITIVITY = 0.5
    
    let inputRollDeg = roll
    if (inputRollDeg > 180) inputRollDeg -= 360
    let inputPitchDeg = pitch
    if (inputPitchDeg > 180) inputPitchDeg -= 360
    inputRollDeg = Math.max(-85, Math.min(85, inputRollDeg))
    
    const inputRollRad  = (inputRollDeg  * Math.PI) / 180 * PITCH_SENSITIVITY
    const inputPitchRad = (inputPitchDeg * Math.PI) / 180 * YAW_SENSITIVITY

    // Target rotations
    const targetPitch = -inputRollRad 
    const targetYaw = inputPitchRad 
    const targetBank = -inputPitchRad * 1.5 

    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetPitch, 0.06)
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetYaw, 0.06)
    groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetBank, 0.1)

    // Positional "Lag" Drift
    const driftIntensity = 5.0
    const liftIntensity = 3.5
    
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, (inputPitchRad * driftIntensity), 0.05)
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, (-inputRollRad * liftIntensity), 0.05)

    // Vibration
    groupRef.current.position.y += Math.sin(timeRef.current * 40) * 0.0015
  })

  return (
    <group ref={groupRef}>
      <group ref={modelRef} scale={0.5}>
        <primitive object={model} position={[0, -0.05, 2.8]} />
        
        {/* Rear Engine Exhaust & Heat Blur */}
        <group position={[0, 0.05, 0.2]}>
          {/* Blue Jet Glows */}
          <pointLight position={[0.4, 0, -0.5]} intensity={18} color="#3b82f6" distance={8} />
          <pointLight position={[-0.4, 0, -0.5]} intensity={18} color="#3b82f6" distance={8} />
          
          {/* Engine Heat Blur / Particles */}
          <Sparkles 
            count={100} 
            scale={[1, 1, 4]} 
            size={0.6} 
            speed={4} 
            color="#3b82f6" 
            position={[0, 0, -1]} 
          />

          <mesh position={[0.5, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.25, 0.15, 0.6, 16]} />
            <meshStandardMaterial color="#111" emissive="#3b82f6" emissiveIntensity={12} transparent opacity={0.6} />
          </mesh>
          <mesh position={[-0.5, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.25, 0.15, 0.6, 16]} />
            <meshStandardMaterial color="#111" emissive="#3b82f6" emissiveIntensity={10} transparent opacity={0.6} />
          </mesh>
        </group>

        {/* Weapons / Muzzle Flash */}
        {isFiring && (
          <group position={[0, -0.1, 2.5]}>
            <mesh position={[0.6, 0, 0]}>
              <sphereGeometry args={[0.3, 8, 8]} />
              <meshBasicMaterial color="#ffff00" />
            </mesh>
            <mesh position={[-0.6, 0, 0]}>
              <sphereGeometry args={[0.3, 8, 8]} />
              <meshBasicMaterial color="#ffff00" />
            </mesh>
            <pointLight position={[0, 0, 0]} intensity={15} color="#ffff00" distance={8} />
          </group>
        )}
      </group>
    </group>
  )
})
 
export default Airplane
