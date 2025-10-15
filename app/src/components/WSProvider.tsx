import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type WSMessage = any

type WSStatus = 'connecting' | 'connected' | 'disconnected'
type WSContextType = {
  connected: boolean
  status: WSStatus
  send: (msg: WSMessage) => void
  addListener: (fn: (data: WSMessage) => void) => () => void
}

const WSContext = createContext<WSContextType | null>(null)

export function WSProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<WSStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef(new Set<(data: WSMessage) => void>())
  const shouldReconnectRef = useRef(true)
  const attemptsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const endpointsRef = useRef<string[] | null>(null)
  const endpointIdxRef = useRef(0)
  const debug = false

  const ensureEndpoints = () => {
    if (endpointsRef.current) return endpointsRef.current
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
    if (envUrl && envUrl.length > 0) {
      const normalized = envUrl.endsWith('/ws') ? envUrl : envUrl.replace(/\/$/, '') + '/ws'
      endpointsRef.current = [normalized]
      return endpointsRef.current
    }
    const proto = (window.location.protocol === 'https:' ? 'wss' : 'ws')
    const host = window.location.hostname
    const sameOrigin = `${proto}://${window.location.host}` // includes port if present
    // Candidate endpoints: prefer same-origin first (works when server serves SPA),
    // then common local ports for dev fallbacks.
    const bases = [
      sameOrigin + '/ws',
      `${proto}://${host}/ws`,
      `${proto}://${host}:8787/ws`,
      `${proto}://${host}:3000/ws`,
    ]
    // Deduplicate
    endpointsRef.current = Array.from(new Set(bases))
    return endpointsRef.current
  }

  const rotateEndpoint = () => {
    const eps = ensureEndpoints()
    endpointIdxRef.current = (endpointIdxRef.current + 1) % eps.length
    return eps[endpointIdxRef.current]
  }

  const currentEndpoint = () => {
    const eps = ensureEndpoints()
    return eps[endpointIdxRef.current] || eps[0]
  }

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return
    setStatus('connecting')
    const base = currentEndpoint()
    const url = `${base}`
    if (debug) console.log('[WS] connecting to', url)
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onopen = () => {
      setConnected(true)
      setStatus('connected')
      attemptsRef.current = 0
      // start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(() => {
        try { wsRef.current?.readyState === WebSocket.OPEN && wsRef.current?.send(JSON.stringify({ type: 'ping', t: Date.now() })) } catch {}
      }, 20000)
      if (debug) console.log('[WS] connected')
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        listenersRef.current.forEach(fn => { try { fn(data) } catch {} })
      } catch {}
    }
    ws.onerror = () => {
      if (debug) console.log('[WS] socket error on', currentEndpoint())
    }
    ws.onclose = () => {
      setConnected(false)
      setStatus('disconnected')
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      if (!shouldReconnectRef.current) return
      const attempt = (attemptsRef.current || 0) + 1
      attemptsRef.current = attempt
      // rotate endpoint every 2 failed attempts for broader coverage
      if (attempt % 2 === 0) rotateEndpoint()
      if (debug) console.log('[WS] closed. attempt', attempt, 'next endpoint', currentEndpoint())
      const base = 1000 * Math.pow(2, attempt - 1)
      const jitter = Math.floor(Math.random() * 1000)
      let delay = Math.min(30000, base + jitter)
      // First retry should be immediate for instant reconnect UX
      if (attempt === 1) delay = 0
      if (timerRef.current) clearTimeout(timerRef.current)
      if (delay === 0) {
        connect()
      } else {
        timerRef.current = setTimeout(connect, delay)
      }
    }
  }, [])

  useEffect(() => {
    shouldReconnectRef.current = true
    connect()
    const beforeUnload = () => {
      shouldReconnectRef.current = false
      try { wsRef.current?.close() } catch {}
    }
    window.addEventListener('beforeunload', beforeUnload)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        // nudge reconnect if needed
        if (!connected) connect()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', connect)
    return () => {
      shouldReconnectRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      try { wsRef.current?.close() } catch {}
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', connect)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [connect])

  const send = useCallback((msg: WSMessage) => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
    } catch {}
  }, [])

  const addListener = useCallback((fn: (data: WSMessage) => void) => {
    listenersRef.current.add(fn)
    return () => { listenersRef.current.delete(fn) }
  }, [])

  const value = useMemo(() => ({ connected, status, send, addListener }), [connected, status, send, addListener])
  return <WSContext.Provider value={value}>{children}</WSContext.Provider>
}

export function useWS() {
  const ctx = useContext(WSContext)
  if (!ctx) throw new Error('useWS must be used within WSProvider')
  return ctx
}
