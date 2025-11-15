import React from 'react'

const API_URL = (import.meta as any).env?.VITE_API_URL || ''
const SHOW = String((import.meta as any).env?.VITE_SHOW_DEBUG_BANNER || '').toLowerCase() === '1'

export default function RuntimeDebugBanner() {
  if (!SHOW) return null
  let token = ''
  try { token = localStorage.getItem('authToken') || '' } catch (e) { token = '' }
  const tokenExists = !!token
  const tokenPreview = tokenExists ? (token.slice(0, 8) + '...') : 'none'
  return (
    <div style={{position: 'fixed', right: 12, bottom: 12, zIndex: 9999}}>
      <div style={{fontFamily: 'monospace', fontSize: 12, background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 10px', borderRadius: 8, boxShadow: '0 4px 18px rgba(0,0,0,0.3)'}}>
        <div style={{fontWeight: 700, marginBottom: 6}}>NDN Debug</div>
        <div style={{marginBottom: 3}}><strong>API:</strong> {API_URL || 'relative /api/*'}</div>
        <div style={{marginBottom: 3}}><strong>Origin:</strong> {typeof window !== 'undefined' ? window.location.origin : 'n/a'}</div>
        <div><strong>Token:</strong> {tokenExists ? tokenPreview : 'none'}</div>
      </div>
    </div>
  )
}
