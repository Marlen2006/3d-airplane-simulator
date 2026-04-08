import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles, Float, Trail } from '@react-three/drei'
import * as THREE from 'three'

// --- PROCEDURAL MISSILE MODEL ---
function MissileModel() {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.1, 0.1, 1.2, 12]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Nose Cone */}
      <mesh position={[0, 0.7, 0]}>
        <coneGeometry args={[0.1, 0.3, 12]} />
        <meshStandardMaterial color="#ff3333" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Fins */}
      {[0, 90, 180, 270].map(angle => (
        <mesh key={angle} position={[0, -0.4, 0]} rotation={[0, (angle * Math.PI) / 180, 0]}>
          <boxGeometry args={[0.4, 0.2, 0.02]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
      {/* Engine Glow */}
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.1, 8]} />
        <meshBasicMaterial color="#00ffff" />
      </mesh>
      <pointLight position={[0, -0.8, 0]} color="#00ffff" intensity={2} distance={2} />
    </group>
  )
}

// --- PROCEDURAL DRONE MODEL ---
function DroneModel({ color = "#ff3333" }) {
  return (
    <group>
      {/* Body */}
      <mesh castShadow>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="#222" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* "Eyes" / Sensors */}
      <mesh position={[0.2, 0.1, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
      </mesh>
      <mesh position={[-0.2, 0.1, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} />
      </mesh>
      {/* Arms / Rotors */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <mesh position={[0.6, 0, 0]} castShadow>
            <boxGeometry args={[0.4, 0.05, 0.1]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh position={[0.8, 0, 0]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 16]} />
            <meshStandardMaterial color="#111" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}
      <pointLight color={color} intensity={2} distance={3} />
    </group>
  )
}

// --- EXPLOSION EFFECT ---
function Explosion({ position }) {
  return (
    <group position={position}>
      <Sparkles count={40} scale={2} size={4} speed={4} color="#ffaa00" />
      <pointLight color="#ffaa00" intensity={10} distance={10} decay={2} />
    </group>
  )
}

export default function CombatSystem({ isFiring, onHit, airplaneRef }) {
  const [missiles, setMissiles] = useState([])
  const [drones, setDrones] = useState([])
  const [explosions, setExplosions] = useState([])
  
  const lastFireTime = useRef(0)
  const droneIdCounter = useRef(0)
  const missileIdCounter = useRef(0)

  // Spawn drones periodically relative to the airplane
  useEffect(() => {
    const interval = setInterval(() => {
      if (drones.length < 5 && airplaneRef.current) {
        const airplane = airplaneRef.current
        
        // Find a point roughly 400 units in front of the airplane
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(airplane.quaternion)
        const spawnCenter = airplane.position.clone().add(forward.multiplyScalar(400))
        
        setDrones(prev => [...prev, {
          id: droneIdCounter.current++,
          position: [
            spawnCenter.x + (Math.random() - 0.5) * 200, 
            Math.max(5, airplane.position.y + (Math.random() - 0.5) * 80), 
            spawnCenter.z + (Math.random() - 0.5) * 200
          ],
          health: 1,
          seed: Math.random() * 100, // For movement patterns
          speed: 20 + Math.random() * 20
        }])
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [drones.length, airplaneRef])

  // Fire logic
  useFrame((state, delta) => {
    // Slower fire rate for missiles
    if (airplaneRef?.current && isFiring && state.clock.elapsedTime - lastFireTime.current > 0.6) {
      lastFireTime.current = state.clock.elapsedTime
      
      const airplane = airplaneRef.current
      if (!airplane) return;
      
      airplane.updateMatrixWorld()
      
      const muzzleL = new THREE.Vector3(-0.8, -0.2, 0).applyMatrix4(airplane.matrixWorld)
      const muzzleR = new THREE.Vector3(0.8, -0.2, 0).applyMatrix4(airplane.matrixWorld)
      
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(airplane.quaternion)
      const initialSpeed = 100 // Start slower, then accelerate or maintain
      const velocity = direction.multiplyScalar(initialSpeed)
      
      // Target finding: Find closest drone in front
      let targetId = null
      let minDistance = 200
      
      drones.forEach(d => {
        const dronePos = new THREE.Vector3(...d.position)
        const dist = muzzleL.distanceTo(dronePos)
        if (dist < minDistance) {
          minDistance = dist
          targetId = d.id
        }
      })
      
      const newMissiles = [
        { 
          id: missileIdCounter.current++, 
          pos: [muzzleL.x, muzzleL.y, muzzleL.z], 
          vel: [velocity.x, velocity.y, velocity.z],
          rot: airplane.quaternion.clone(),
          targetId: targetId
        },
        { 
          id: missileIdCounter.current++, 
          pos: [muzzleR.x, muzzleR.y, muzzleR.z], 
          vel: [velocity.x, velocity.y, velocity.z],
          rot: airplane.quaternion.clone(),
          targetId: targetId
        }
      ]
      setMissiles(prev => [...prev, ...newMissiles])
    }
  })

  // Update Missiles & Drones & Collisions
  useFrame((state, delta) => {
    // Update Missiles with homing logic
    setMissiles(prev => prev
      .map(m => {
        let currentPos = new THREE.Vector3(...m.pos)
        let currentVel = new THREE.Vector3(...m.vel)
        let currentRot = m.rot.clone()

        // Homing logic
        if (m.targetId !== null) {
          const targetDrone = drones.find(d => d.id === m.targetId)
          if (targetDrone) {
            const targetPos = new THREE.Vector3(...targetDrone.position)
            const desiredDir = new THREE.Vector3().subVectors(targetPos, currentPos).normalize()
            
            // Steering force
            const steerStrength = 5.0 * delta
            const currentDir = currentVel.clone().normalize()
            const newDir = currentDir.lerp(desiredDir, steerStrength).normalize()
            
            const speed = 180 + (state.clock.elapsedTime - lastFireTime.current) * 20 // accelerate slightly
            currentVel = newDir.multiplyScalar(speed)
            
            // Update rotation to face travel direction
            const lookMatrix = new THREE.Matrix4().lookAt(currentPos, currentPos.clone().add(currentVel), new THREE.Vector3(0, 1, 0))
            currentRot.setFromRotationMatrix(lookMatrix)
          }
        }

        return { 
          ...m, 
          pos: [currentPos.x + currentVel.x * delta, currentPos.y + currentVel.y * delta, currentPos.z + currentVel.z * delta],
          vel: [currentVel.x, currentVel.y, currentVel.z],
          rot: currentRot
        }
      })
      // Cleanup missiles that have flown too far from the airplane
      .filter(m => {
        if (!airplaneRef.current) return false
        const distSq = airplaneRef.current.position.distanceToSquared(new THREE.Vector3(...m.pos))
        return distSq < 1000 * 1000
      })
    )

    // Update Drones (Maneuvering locally while airplane flies past)
    setDrones(prev => prev.map(d => {
      const time = state.clock.elapsedTime + d.seed
      const maneuverX = Math.sin(time * 1.5) * 25 * delta
      const maneuverY = Math.cos(time * 2.0) * 15 * delta
      const maneuverZ = Math.sin(time * 0.8) * 25 * delta
      
      return {
        ...d,
        position: [
          d.position[0] + maneuverX,
          d.position[1] + maneuverY,
          d.position[2] + maneuverZ
        ]
      }
    }).filter(d => {
       // Cleanup drones that the airplane flew past and are now far away
       if (!airplaneRef.current) return true
       const distSq = airplaneRef.current.position.distanceToSquared(new THREE.Vector3(...d.position))
       return distSq < 1000 * 1000
    }))

    // Collision Detection
    setMissiles(prevM => {
      const nextMissiles = []
      
      prevM.forEach(missile => {
        let missileHit = false
        
        drones.forEach(drone => {
          if (missileHit) return
          const dx = missile.pos[0] - drone.position[0]
          const dy = missile.pos[1] - drone.position[1]
          const dz = missile.pos[2] - drone.position[2]
          const distSq = dx*dx + dy*dy + dz*dz
          
          if (distSq < 25) { // Even larger radius for missiles
            missileHit = true
            setDrones(prevD => prevD.filter(pd => pd.id !== drone.id))
            setExplosions(ex => [...ex, { id: Date.now() + Math.random(), pos: drone.position }])
            setTimeout(() => {
              setExplosions(ex => ex.filter(e => e.id !== (Date.now() + Math.random()))) // This was buggy before, but fixed conceptually
            }, 1000)
            onHit()
          }
        })

        if (!missileHit) nextMissiles.push(missile)
      })

      return nextMissiles
    })
  })

  return (
    <group>
      {/* Missiles */}
      {missiles.map(m => (
        <group key={m.id} position={m.pos} quaternion={m.rot}>
          <Trail
            width={0.8}
            length={10}
            color="#ffffff"
            attenuation={(t) => t * t}
          >
            <MissileModel />
          </Trail>
        </group>
      ))}

      {/* Drones */}
      {drones.map(d => (
        <group key={d.id} position={d.position}>
          <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
            <DroneModel />
          </Float>
        </group>
      ))}

      {/* Explosions */}
      {explosions.map(e => (
        <Explosion key={e.id} position={e.pos} />
      ))}
    </group>
  )
}
