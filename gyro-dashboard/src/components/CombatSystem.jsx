import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles, Float } from '@react-three/drei'
import * as THREE from 'three'

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

export default function CombatSystem({ isFiring, onHit, airplanePos = [0, 0, 0] }) {
  const [bullets, setBullets] = useState([])
  const [drones, setDrones] = useState([])
  const [explosions, setExplosions] = useState([])
  
  const lastFireTime = useRef(0)
  const droneIdCounter = useRef(0)
  const bulletIdCounter = useRef(0)

  // Spawn drones periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (drones.length < 5) {
        setDrones(prev => [...prev, {
          id: droneIdCounter.current++,
          position: [
            (Math.random() - 0.5) * 60, 
            (Math.random() - 0.5) * 30 + 5, 
            -300 // Spawn far away
          ],
          health: 1,
          seed: Math.random() * 100, // For movement patterns
          speed: 20 + Math.random() * 20
        }])
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [drones.length])

  // Fire logic
  useFrame((state, delta) => {
    if (isFiring && state.clock.elapsedTime - lastFireTime.current > 0.12) {
      lastFireTime.current = state.clock.elapsedTime
      
      const newBullets = [
        { id: bulletIdCounter.current++, pos: [0.6, 0, 2.5], vel: [0, 0, -250] }, // Right gun
        { id: bulletIdCounter.current++, pos: [-0.6, 0, 2.5], vel: [0, 0, -250] } // Left gun
      ]
      setBullets(prev => [...prev, ...newBullets])
    }
  })

  // Update Bullets & Drones & Collisions
  useFrame((state, delta) => {
    // Update Bullets
    setBullets(prev => prev
      .map(b => ({ ...b, pos: [b.pos[0] + b.vel[0] * delta, b.pos[1] + b.vel[1] * delta, b.pos[2] + b.vel[2] * delta] }))
      .filter(b => b.pos[2] > -400) // Cleanup
    )

    // Update Drones (Maneuvering)
    setDrones(prev => prev.map(d => {
      const time = state.clock.elapsedTime + d.seed
      // Sine wave maneuvering
      const maneuverX = Math.sin(time * 1.5) * 15 * delta
      const maneuverY = Math.cos(time * 2.0) * 8 * delta
      
      return {
        ...d,
        position: [
          d.position[0] + maneuverX,
          d.position[1] + maneuverY,
          d.position[2] + d.speed * delta // Flying towards player
        ]
      }
    }).filter(d => d.position[2] < 50)) // Remove if passed player

    // Collision Detection
    setBullets(prevBullets => {
      const nextBullets = []
      let hitDetected = false

      prevBullets.forEach(bullet => {
        let bulletHit = false
        
        // We check against drones state. Note: this is slightly stale 
        // but much better for performance than nested setStates.
        drones.forEach(drone => {
          if (bulletHit) return
          const dx = bullet.pos[0] - drone.position[0]
          const dy = bullet.pos[1] - drone.position[1]
          const dz = bullet.pos[2] - drone.position[2]
          const distSq = dx*dx + dy*dy + dz*dz
          
          if (distSq < 15) { // Slightly larger radius for better feel
            bulletHit = true
            hitDetected = true
            
            // Remove drone and add explosion
            setDrones(prevD => prevD.filter(pd => pd.id !== drone.id))
            setExplosions(ex => [...ex, { id: Date.now() + Math.random(), pos: drone.position }])
            setTimeout(() => {
              setExplosions(ex => ex.filter(e => e.pos !== drone.position))
            }, 1000)
            onHit()
          }
        })

        if (!bulletHit) nextBullets.push(bullet)
      })

      return nextBullets
    })
  })

  return (
    <group>
      {/* Brilliants/Bullets */}
      {bullets.map(b => (
        <mesh key={b.id} position={b.pos}>
          <boxGeometry args={[0.1, 0.1, 2]} />
          <meshBasicMaterial color="#ffff00" />
        </mesh>
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
