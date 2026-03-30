import { useState, useRef, useCallback, useEffect } from 'react'
import Scene3D from './components/Scene3D'
import Dashboard from './components/Dashboard'

export default function App() {
  const [rawRoll, setRawRoll] = useState(0)
  const [rawPitch, setRawPitch] = useState(0)
  const [rawYaw, setRawYaw] = useState(0)

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
          let targetR = 0, targetP = 0, targetY = 0

          if (data.roll  !== undefined) targetR = data.roll
          else if (data.r !== undefined) targetR = data.r
          else if (data.x !== undefined) targetR = data.x

          if (data.pitch !== undefined) targetP = data.pitch
          else if (data.p !== undefined) targetP = data.p
          else if (data.y !== undefined) targetP = data.y

          if (data.yaw   !== undefined) targetY = data.yaw
          else if (data.w !== undefined) targetY = data.w
          else if (data.z !== undefined) targetY = data.z

          // Apply Low-Pass Filter (Smoothing)
          // NewValue = CurrentValue + (Target - CurrentValue) * Factor
          const smoothingFactor = 0.3 
          setRawRoll(prev => prev + (targetR - prev) * smoothingFactor)
          setRawPitch(prev => prev + (targetP - prev) * smoothingFactor)
          setRawYaw(prev => prev + (targetY - prev) * smoothingFactor)
        } catch (err) {
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

  // Demo mode: simulate gyro data when not connected (keyboard)
  useEffect(() => {
    const handleKey = (e) => {
      if (connected) return
      const step = 5
      switch (e.key) {
        case 'ArrowLeft':  setRawRoll(r => Math.max(r - step, -180)); break
        case 'ArrowRight': setRawRoll(r => Math.min(r + step, 180));  break
        case 'ArrowUp':    setRawPitch(p => Math.min(p + step, 90));   break
        case 'ArrowDown':  setRawPitch(p => Math.max(p - step, -90));  break
        case 'a': case 'A': case 'ф': case 'Ф': setRawYaw(y => y - step); break
        case 'd': case 'D': case 'в': case 'В': setRawYaw(y => y + step); break
        case 'r': case 'R': case 'к': case 'К':
          setRawRoll(0); setRawPitch(0); setRawYaw(0); setOffsets({ roll: 0, pitch: 0, yaw: 0 }); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [connected])

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
        <Scene3D roll={roll} pitch={pitch} yaw={yaw} connected={connected} />
      </div>

      {/* Dashboard sidebar */}
      <Dashboard
        roll={roll}
        pitch={pitch}
        yaw={yaw}
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
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Демо-режим:</span><br/>
          ← → : Roll &nbsp;|&nbsp; ↑ ↓ : Pitch &nbsp;|&nbsp; A / D : Yaw &nbsp;|&nbsp; R : Сброс
        </div>
      )}
    </div>
  )
}
