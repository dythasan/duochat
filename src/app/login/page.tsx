'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Store token and user info
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      router.push('/chat')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#0B141A', minHeight: '100dvh' }}
    >
      <div className="w-full max-w-sm px-6">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
            style={{ background: '#00A884' }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: '#E9EDEF' }}>
            DuoChat
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8696A0' }}>
            Private chat for two
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-4 py-3 rounded-lg outline-none text-base transition-all"
              style={{
                background: '#2A3942',
                color: '#E9EDEF',
                border: '1px solid #374045',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#00A884')}
              onBlur={(e) => (e.target.style.borderColor = '#374045')}
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-lg outline-none text-base transition-all"
              style={{
                background: '#2A3942',
                color: '#E9EDEF',
                border: '1px solid #374045',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#00A884')}
              onBlur={(e) => (e.target.style.borderColor = '#374045')}
            />
          </div>

          {error && (
            <div
              className="text-sm text-center py-2 px-3 rounded"
              style={{ background: '#2D1B1B', color: '#FF6B6B' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-base transition-opacity"
            style={{
              background: '#00A884',
              color: '#fff',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
