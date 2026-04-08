import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

// Preload the model
useGLTF.preload('/models/f22_raptor.glb')

const Airplane = forwardRef(({ roll = 0, pitch = 0, yaw = 0, throttle = 1.0, isFiring = false }, ref) => {
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

    // Remapped Control Logic for Real Flight:
    // In demo mode, rawRoll comes from W/S (pitch) and rawPitch from A/D (roll). Wait, App.jsx maps:
    // "keys.current.left -> rawRoll = -MAX_ROLL". So rawRoll is actually Roll (Bank).
    // "keys.current.up -> rawPitch = -MAX_PITCH". So rawPitch is Pitch (Nose up/down).
    
    const inputRollDeg = Math.max(-85, Math.min(85, roll))
    const inputPitchDeg = Math.max(-85, Math.min(85, pitch))
    
    // Flight stick inputs (normalized -1 to 1)
    const stickRoll = inputRollDeg / 60.0
    const stickPitch = inputPitchDeg / 45.0

    // Aerodynamic constants
    const rollRate = 1.8 * delta
    const pitchRate = 1.2 * delta
    const baseSpeed = 30 + (throttle * 30) // meters per second

    // Apply rotation relative to current orientation
    groupRef.current.rotateZ(-stickRoll * rollRate)
    groupRef.current.rotateX(stickPitch * pitchRate)
    
    // Passive turn (Yaw) due to banking (lift vector redirection)
    // A banked plane will naturally drop its nose and turn.
    // We get current bank angle:
    const euler = new THREE.Euler().setFromQuaternion(groupRef.current.quaternion, 'YXZ')
    const currentBank = euler.z
    
    // Apply turn rate proportional to bank angle
    const turnRate = -Math.sin(currentBank) * 0.8 * delta
    // Apply pitch drop proportional to bank (requires pulling back on stick to stay level!)
    const pitchDrop = Math.abs(Math.sin(currentBank)) * 0.2 * delta
    
    groupRef.current.rotateY(turnRate)
    groupRef.current.rotateX(-pitchDrop)

    // Self-righting tendency (aerodynamic stability)
    if (Math.abs(stickRoll) < 0.05) {
      groupRef.current.rotateZ(-currentBank * 1.5 * delta)
    }

    // Move forward in local space (-Z)
    groupRef.current.translateZ(-baseSpeed * delta)

    // Vibration based on throttle
    modelRef.current.position.y = Math.sin(timeRef.current * (30 + throttle * 20)) * (0.001 + throttle * 0.001)
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
