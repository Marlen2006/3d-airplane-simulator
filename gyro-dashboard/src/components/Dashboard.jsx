import { useState, useEffect } from 'react'

const axes = [
  { key: 'roll',  label: 'Roll',  unit: '°', color: '#3b82f6', shadow: '0 0 25px rgba(59,130,246,0.5)',  icon: '↻' },
  { key: 'pitch', label: 'Pitch', unit: '°', color: '#06b6d4', shadow: '0 0 25px rgba(6,182,212,0.5)',   icon: '⤒' },
  { key: 'yaw',   label: 'Yaw',   unit: '°', color: '#8b5cf6', shadow: '0 0 25px rgba(139,92,246,0.5)',  icon: '⟳' },
]

function MiniChart({ data, axisKey, color }) {
  if (!data || data.length < 2) return <div style={{ height: '40px' }} />

  const width = 280
  const height = 40
  const maxPoints = 100
  const padding = 2

  // Map data to points
  const points = data.map((d, i) => {
    const x = (i / (maxPoints - 1)) * width
    const val = d[axisKey]
    // Map -90 to 90 (or -180 to 180) to 0 to height
    // Using a fixed range for stability
    const range = axisKey === 'yaw' ? 360 : 180
    const y = height / 2 - (val / range) * (height - padding * 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`grad-${axisKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        points={points}
        style={{ filter: `drop-shadow(0 0 4px ${color}44)` }}
      />
      <path
        d={`M 0,${height} L ${points} L ${width},${height} Z`}
        fill={`url(#grad-${axisKey})`}
      />
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="2,2" />
    </svg>
  )
}

function AxisCard({ axis, value }) {
  const absVal = Math.abs(value)
  const maxAngle = 180
  const pct = Math.min((absVal / maxAngle) * 100, 100)

  return (
    <div className="glass-card" style={{
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '18px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            background: `${axis.color}15`,
            color: axis.color,
          }}>{axis.icon}</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            color: 'var(--text-secondary)',
          }}>{axis.label}</span>
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '32px',
        color: axis.color,
        textShadow: axis.shadow,
        lineHeight: 1,
      }}>
        {value.toFixed(1)}<span style={{ fontSize: '16px', opacity: 0.6 }}>{axis.unit}</span>
      </div>
      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '4px',
        borderRadius: '2px',
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: '2px',
          background: `linear-gradient(90deg, ${axis.color}88, ${axis.color})`,
          boxShadow: `0 0 10px ${axis.color}66`,
          transition: 'width 0.15s ease',
        }} />
      </div>
    </div>
  )
}

function StatusBadge({ connected, connecting, sensorOk = true }) {
  const color = connected ? (sensorOk ? '#10b981' : '#f59e0b') : connecting ? '#f59e0b' : '#ef4444'
  const text = connected 
    ? (sensorOk ? 'Система: OK' : 'Датчик: FAIL') 
    : (connecting ? 'Подключение...' : 'Отключено')

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 14px',
      borderRadius: '100px',
      background: `${color}15`,
      border: `1px solid ${color}30`,
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 10px ${color}`,
        animation: (connected && sensorOk) ? 'none' : 'blink 1.5s infinite',
      }} />
      <span style={{
        fontSize: '12px',
        fontWeight: 600,
        color,
        letterSpacing: '0.5px',
      }}>{text}</span>
    </div>
  )
}

export default function Dashboard({
  roll, pitch, yaw, throttle = 1.0, sensorOk = true,
  connected, connecting,
  espIp, onIpChange, onConnect, onDisconnect,
  onSetZero, onResetOffsets,
  history, offsets
}) {
  const [fps, setFps] = useState(0)
  const [msgCount, setMsgCount] = useState(0)

  // Normalize throttle to percentage for progress bar (0.5 - 6.0 range)
  const throttlePct = Math.min(Math.max((throttle - 0.5) / 5.5 * 100, 0), 100)

  useEffect(() => {
    let frames = 0
    const interval = setInterval(() => {
      setFps(frames)
      frames = 0
    }, 1000)

    const onFrame = () => {
      frames++
      if (connected) reqId = requestAnimationFrame(onFrame)
    }
    let reqId = requestAnimationFrame(onFrame)

    return () => {
      clearInterval(interval)
      cancelAnimationFrame(reqId)
    }
  }, [connected])

  useEffect(() => {
    if (connected) {
      setMsgCount(prev => prev + 1)
    }
  }, [roll, pitch, yaw])

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: '340px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      zIndex: 10,
      overflowY: 'auto',
      background: 'linear-gradient(180deg, rgba(4,6,15,0.85) 0%, rgba(4,6,15,0.7) 100%)',
      backdropFilter: 'blur(30px)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '24px' }}>✈️</span>
          <span>
            Gyro<span style={{ color: 'var(--accent-blue)' }}>scope</span>
          </span>
        </div>
        <p style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginTop: '4px',
        }}>ESP8266 • Мониторинг в реальном времени</p>
      </div>

      {/* Status */}
      <StatusBadge connected={connected} connecting={connecting} sensorOk={sensorOk} />

      {/* Connection */}
      <div className="glass-card" style={{ padding: '16px' }}>
        <label style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          color: 'var(--text-muted)',
          marginBottom: '8px',
          display: 'block',
        }}>IP-адрес ESP8266</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={espIp}
            onChange={e => onIpChange(e.target.value)}
            placeholder="192.168.4.1"
            disabled={connected || connecting}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-glass)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-glass)'}
          />
        </div>
        <button
          onClick={connected ? onDisconnect : onConnect}
          disabled={connecting || !espIp}
          style={{
            width: '100%',
            marginTop: '10px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            fontWeight: 600,
            fontSize: '13px',
            letterSpacing: '0.5px',
            color: '#fff',
            background: connected
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            boxShadow: connected
              ? '0 4px 20px rgba(239,68,68,0.3)'
              : '0 4px 20px rgba(59,130,246,0.3)',
          }}
        >
          {connecting ? '⏳ Подключение...' : connected ? '⏹ Отключить' : '▶ Подключиться'}
        </button>
      </div>

      {/* Throttle Control Indicator */}
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        color: 'var(--text-muted)',
        marginTop: '4px',
      }}>Тяга двигателя</div>

      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', color: '#10b981' }}>⚡</span>
            <span style={{ 
              fontWeight: 600, fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' 
            }}>Throttle</span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: '#10b981', fontSize: '20px' }}>
            {(throttle * 100).toFixed(0)}%
          </div>
        </div>
        <div style={{
          width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
        }}>
          <div style={{
            width: `${throttlePct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #10b981, #34d399)',
            boxShadow: '0 0 10px rgba(16,185,129,0.3)',
            transition: 'width 0.1s ease',
          }} />
        </div>
      </div>

      {/* Axis values */}
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        color: 'var(--text-muted)',
        marginTop: '4px',
      }}>Данные гироскопа</div>

      {axes.map(axis => (
        <div key={axis.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <AxisCard
            axis={axis}
            value={axis.key === 'roll' ? roll : axis.key === 'pitch' ? pitch : yaw}
          />
          <div style={{ padding: '0 10px', marginTop: '-4px' }}>
            <MiniChart data={history} axisKey={axis.key} color={axis.color} />
          </div>
        </div>
      ))}

      {/* Calibration */}
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        color: 'var(--text-muted)',
        marginTop: '12px',
      }}>Калибровка</div>

      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Смещения:</span>
          <span style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-orange)' }}>
            {offsets.roll.toFixed(0)}°, {offsets.pitch.toFixed(0)}°, {offsets.yaw.toFixed(0)}°
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSetZero}
            style={{
              flex: 2,
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >🎯 Установить 0</button>
          <button
            onClick={onResetOffsets}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              fontSize: '11px',
            }}
          >Сброс</button>
        </div>
      </div>

      {/* Stats footer */}
      <div className="glass-card" style={{
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-around',
        marginTop: 'auto',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Сообщений</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--accent-cyan)' }}>
            {msgCount}
          </div>
        </div>
        <div style={{ width: '1px', background: 'var(--border-glass)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Протокол</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)' }}>
            WS
          </div>
        </div>
      </div>
    </div>
  )
}
