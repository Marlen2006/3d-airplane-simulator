import { useState, useRef, useCallback, useEffect } from 'react'
import Scene3D from './components/Scene3D'
import Dashboard from './components/Dashboard'

export default function App() {
  const [rawRoll, setRawRoll] = useState(0)
  const [rawPitch, setRawPitch] = useState(0)
  const [rawYaw, setRawYaw] = useState(0)
  const [throttle, setThrottle] = useState(1.0)
  const [sensorOk, setSensorOk] = useState(true)
  const [isFiring, setIsFiring] = useState(false)
  const [score, setScore] = useState(0)

  // Refs for accessing values in onmessage without re-creating the WS
  const rawRollRef = useRef(0)
  const rawPitchRef = useRef(0)
  const rawYawRef = useRef(0)

  // Keep refs in sync
  useEffect(() => { rawRollRef.current = rawRoll }, [rawRoll])
  useEffect(() => { rawPitchRef.current = rawPitch }, [rawPitch])
  useEffect(() => { rawYawRef.current = rawYaw }, [rawYaw])

  const [offsets, setOffsets] = useState({ roll: 0, pitch: 0, yaw: 0 })
  const [history, setHistory] = useState([])

  const [espIp, setEspIp]         = useState('192.168.4.1')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  const handleConnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    setConnecting(true)
    const url = `ws://${espIp}:81`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setConnecting(false)
        console.log('[WS] Connected to', url)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Initialize with ref values to avoid resetting to 0
          let targetR = rawRollRef.current
          let targetP = rawPitchRef.current
          let targetY = rawYawRef.current

          if (data.roll  !== undefined) targetR = data.roll
          else if (data.r !== undefined) targetR = data.r

          if (data.pitch !== undefined) targetP = data.pitch
          else if (data.p !== undefined) targetP = data.p

          if (data.yaw   !== undefined) targetY = data.yaw
          else if (data.w !== undefined) targetY = data.w

          if (data.throttle !== undefined) {
             setThrottle(prev => (Math.abs(prev - data.throttle) > 0.01 ? data.throttle : prev))
          }

          if (data.fire !== undefined) {
             setIsFiring(prev => (prev !== !!data.fire ? !!data.fire : prev))
          }

          if (data.sensor !== undefined) {
             setSensorOk(prev => (prev !== !!data.sensor ? !!data.sensor : prev))
          }

          // Apply Low-Pass Filter (Smoothing)
          // NewValue = CurrentValue + (Target - CurrentValue) * Factor
          const smoothingFactor = 0.3 
          setRawRoll(prev => prev + (targetR - prev) * smoothingFactor)
          setRawPitch(prev => prev + (targetP - prev) * smoothingFactor)
          setRawYaw(prev => prev + (targetY - prev) * smoothingFactor)
        } catch (err) {
          console.error('[WS] Parse error:', err, event.data)
          const parts = event.data.split(',').map(Number)
          if (parts.length === 3 && parts.every(n => !isNaN(n))) {
            const smoothingFactor = 0.3
            setRawRoll(prev => prev + (parts[0] - prev) * smoothingFactor)
            setRawPitch(prev => prev + (parts[1] - prev) * smoothingFactor)
            setRawYaw(prev => prev + (parts[2] - prev) * smoothingFactor)
          }
        }
      }

      ws.onerror = (err) => {
        console.error('[WS] Error:', err)
      }

      ws.onclose = () => {
        setConnected(false)
        setConnecting(false)
        wsRef.current = null
        console.log('[WS] Disconnected')
      }

      // Timeout for connection
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close()
          setConnecting(false)
        }
      }, 5000)
    } catch (err) {
      console.error('[WS] Failed to connect:', err)
      setConnecting(false)
    }
  }, [espIp])

  const handleDisconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
    setConnecting(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [])

  // Demo mode: simulate joystick with keyboard
  const keys = useRef({ left: false, right: false, up: false, down: false, yawLeft: false, yawRight: false })
  
  useEffect(() => {
    const handleKey = (e) => {
      if (connected) return
      switch (e.key.toLowerCase()) {
        case 'arrowleft': case 'a': case 'ф': keys.current.left = true; break
        case 'arrowright': case 'd': case 'в': keys.current.right = true; break
        case 'arrowup': case 'w': case 'ц': keys.current.up = true; break
        case 'arrowdown': case 's': case 'ы': keys.current.down = true; break
        case 'q': case 'й': keys.current.yawLeft = true; break
        case 'e': case 'у': keys.current.yawRight = true; break
        case 'r': case 'к': 
          setRawRoll(0); setRawPitch(0); setRawYaw(0); setOffsets({ roll: 0, pitch: 0, yaw: 0 }); 
          setThrottle(1.0); break
        case ' ': setIsFiring(true); break
        case 'shift': setThrottle(t => Math.min(t + 0.5, 6.0)); break
        case 'control': setThrottle(t => Math.max(t - 0.5, 0.2)); break
      }
    }
    const handleKeyUp = (e) => {
      switch (e.key.toLowerCase()) {
        case 'arrowleft': case 'a': case 'ф': keys.current.left = false; break
        case 'arrowright': case 'd': case 'в': keys.current.right = false; break
        case 'arrowup': case 'w': case 'ц': keys.current.up = false; break
        case 'arrowdown': case 's': case 'ы': keys.current.down = false; break
        case 'q': case 'й': keys.current.yawLeft = false; break
        case 'e': case 'у': keys.current.yawRight = false; break
        case ' ': setIsFiring(false); break
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [connected])

  // Joystick interpolation loop
  useEffect(() => {
    if (connected) return
    let animationFrameId
    let lastTime = performance.now()
    
    // Joystick ranges in degrees (arbitrary max tilt angles)
    const MAX_ROLL = 60
    const MAX_PITCH = 45
    const MAX_YAW = 45
    
    const loop = (time) => {
      const delta = (time - lastTime) / 1000
      lastTime = time
      
      setRawRoll(prev => {
        let target = 0
        if (keys.current.left) target = -MAX_ROLL // bank left
        if (keys.current.right) target = MAX_ROLL // bank right
        // interpolate smoothly
        return prev + (target - prev) * 5.0 * delta
      })
      
      setRawPitch(prev => {
        let target = 0
        if (keys.current.up) target = -MAX_PITCH // nose down
        if (keys.current.down) target = MAX_PITCH // nose up (pull back)
        return prev + (target - prev) * 5.0 * delta
      })

      setRawYaw(prev => {
        let target = 0
        if (keys.current.yawLeft) target = -MAX_YAW // rudder left
        if (keys.current.yawRight) target = MAX_YAW // rudder right
        return prev + (target - prev) * 5.0 * delta
      })
      
      animationFrameId = requestAnimationFrame(loop)
    }
    animationFrameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animationFrameId)
  }, [connected])

  // --- AUDIO SYNTHESIZER & ENGINE AUDIO ---
  const audioCtx = useRef(null)
  const engineSynths = useRef(null)
  const missileSoundRef = useRef(null)

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtx.current
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    // Restore procedural jet engine sound if not done yet
    if (!engineSynths.current) {
      const bufferSize = ctx.sampleRate * 2 // 2 seconds of noise buffer
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        data[i] = (lastOut + (0.02 * white)) / 1.02
        lastOut = data[i]
        data[i] *= 3.5
      }

      const noiseSrc = ctx.createBufferSource()
      noiseSrc.buffer = buffer
      noiseSrc.loop = true
      
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 800
      
      const highpass = ctx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 120
      
      const turbineOsc = ctx.createOscillator()
      turbineOsc.type = 'sawtooth'
      turbineOsc.frequency.value = 2500
      
      const turbineFilter = ctx.createBiquadFilter()
      turbineFilter.type = 'lowpass'
      turbineFilter.frequency.value = 4000
      
      const turbineGain = ctx.createGain()
      turbineGain.gain.value = 0.03
      
      const mainGain = ctx.createGain()
      mainGain.gain.value = 0.3
      
      noiseSrc.connect(highpass)
      highpass.connect(lowpass)
      lowpass.connect(mainGain)
      
      turbineOsc.connect(turbineFilter)
      turbineFilter.connect(turbineGain)
      turbineGain.connect(mainGain)
      
      mainGain.connect(ctx.destination)
      
      noiseSrc.start()
      turbineOsc.start()
      
      engineSynths.current = {
        mainGain,
        lowpass,
        turbineOsc,
        turbineGain
      }
    }

    // Preload missile launch sound if not already done
    if (!missileSoundRef.current) {
      const audio = new Audio('/sounds/missile_launch.mp3')
      audio.volume = 0.4
      missileSoundRef.current = audio
    }
  }

  const playMissileLaunchSound = useCallback(() => {
    initAudio()
    if (missileSoundRef.current) {
      // Create a clone to allow rapid firing if needed
      const sound = missileSoundRef.current.cloneNode()
      sound.volume = 0.4
      sound.play().catch(e => console.warn('Audio play blocked:', e))
    }
  }, [])

  const playExplosionSound = useCallback(() => {
    initAudio()
    const ctx = audioCtx.current
    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < buffer.length; i++) data[i] = Math.random() * 2 - 1
    
    noise.buffer = buffer
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(400, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.5)
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    
    noise.start()
    noise.stop(ctx.currentTime + 0.5)
  }, [])

  // Trigger sound on fire
  const lastFireTime = useRef(0)
  useEffect(() => {
    if (isFiring && Date.now() - lastFireTime.current > 600) {
      playMissileLaunchSound()
      lastFireTime.current = Date.now()
    }
  }, [isFiring, playMissileLaunchSound])

  const onHit = useCallback(() => {
    setScore(s => s + 100)
    playExplosionSound()
  }, [playExplosionSound])

  useEffect(() => {
    const resume = () => {
      initAudio()
      if (audioCtx.current && audioCtx.current.state === 'suspended') {
        audioCtx.current.resume()
      }
    }
    window.addEventListener('click', resume, { once: true })
    window.addEventListener('keydown', resume, { once: true })
    return () => {
      window.removeEventListener('click', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [])

  // Update procedural engine audio based on throttle
  useEffect(() => {
    if (engineSynths.current && audioCtx.current) {
      const { mainGain, lowpass, turbineOsc, turbineGain } = engineSynths.current
      const t = audioCtx.current.currentTime
      
      // Overall volume
      const vol = 0.2 + (throttle * 0.1)
      mainGain.gain.setTargetAtTime(Math.min(Math.max(vol, 0.05), 0.8), t, 0.2)
      
      // Throttle increases the high frequency cut-off -> more harsh noise
      const freq = 600 + (throttle * 900)
      lowpass.frequency.setTargetAtTime(Math.min(Math.max(freq, 400), 5000), t, 0.2)
      
      // Turbine whine frequency pitch goes up with throttle
      const turbineFreq = 1500 + (throttle * 800)
      turbineOsc.frequency.setTargetAtTime(turbineFreq, t, 0.2)
      
      // Turbine whine volume goes up slightly with throttle
      const whineVol = 0.01 + (throttle * 0.02)
      turbineGain.gain.setTargetAtTime(Math.min(whineVol, 0.15), t, 0.2)
    }
  }, [throttle])

  // Computed values
  const roll  = rawRoll - offsets.roll
  const pitch = rawPitch - offsets.pitch
  const yaw   = rawYaw - offsets.yaw

  // History tracking
  useEffect(() => {
    const timer = setInterval(() => {
      setHistory(prev => {
        const next = [...prev, { roll, pitch, yaw }]
        if (next.length > 100) return next.slice(-100)
        return next
      })
    }, 100) // 10Hz sampling for history (save some CPU)
    return () => clearInterval(timer)
  }, [roll, pitch, yaw])

  const handleSetZero = useCallback(() => {
    setOffsets({ roll: rawRoll, pitch: rawPitch, yaw: rawYaw })
  }, [rawRoll, rawPitch, rawYaw])

  const handleResetOffsets = useCallback(() => {
    setOffsets({ roll: 0, pitch: 0, yaw: 0 })
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Background orbs */}
      <div className="app-bg">
        <div className="orb3" />
        <div className="grid-overlay" />
      </div>

      {/* 3D viewport */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '340px',
        right: 0,
        bottom: 0,
        zIndex: 1,
      }}>
        <Scene3D 
          roll={roll} 
          pitch={pitch} 
          yaw={yaw} 
          connected={connected} 
          throttle={throttle} 
          isFiring={isFiring}
          onHit={onHit}
        />
      </div>

      {/* Score Overlay */}
      <div className="neon-cyan" style={{
        position: 'absolute',
        top: '30px',
        right: '40px',
        zIndex: 10,
        fontSize: '32px',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        letterSpacing: '2px',
      }}>
        SCORE: {score.toString().padStart(6, '0')}
      </div>

      {/* Dashboard sidebar */}
      <Dashboard
        roll={roll}
        pitch={pitch}
        yaw={yaw}
        throttle={throttle}
        sensorOk={sensorOk}
        connected={connected}
        connecting={connecting}
        espIp={espIp}
        onIpChange={setEspIp}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onSetZero={handleSetZero}
        onResetOffsets={handleResetOffsets}
        history={history}
        offsets={offsets}
      />

      {/* Keyboard hint overlay */}
      {!connected && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 20,
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(4,6,15,0.8)',
          border: '1px solid var(--border-glass)',
          backdropFilter: 'blur(10px)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Управление самолетом (Аркада):</span><br/>
          W / S : Тангаж (вверх/вниз)<br/>
          A / D : Крен (влево/вправо) - чтобы повернуть<br/>
          Q / E : Рысканье (педали)<br/>
          Shift / Ctrl : Газ / Тормоз <br/>
          Пробел : Огонь
        </div>
      )}
    </div>
  )
}
