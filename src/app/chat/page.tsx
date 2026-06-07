'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { USERS } from '@/lib/users'

interface User {
  id: string
  username: string
}

interface Message {
  id: string
  content?: string | null
  imageData?: string | null
  imageType?: string | null
  type: 'TEXT' | 'IMAGE'
  createdAt: string
  read: boolean
  readAt?: string | null
  senderId: string
  receiverId: string
  sender: { id: string; username: string }
  receiver: { id: string; username: string }
  tempId?: string
  pending?: boolean
}

export default function ChatPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [otherUser, setOtherUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isOtherOnline, setIsOtherOnline] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<{ data: string; type: string } | null>(null)
  const [fullImage, setFullImage] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')

    if (!token || !userStr) {
      router.push('/login')
      return
    }

    const user: User = JSON.parse(userStr)
    setCurrentUser(user)

    // Find other user
    const other = USERS.find((u) => u.id !== user.id)
    if (other) {
      setOtherUser({ id: other.id, username: other.username })
    }

    // Fetch message history
    fetch(`/api/messages?otherUserId=${other?.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages)
          setTimeout(() => scrollToBottom(false), 100)
        }
      })
      .catch(console.error)

    // Connect socket
    const socketUrl = window.location.origin
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    newSocket.on('connect', () => {
      setIsConnected(true)
      newSocket.emit('user:join', { userId: user.id, username: user.username })
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
    })

    newSocket.on('users:online', (onlineIds: string[]) => {
      if (other && onlineIds.includes(other.id)) {
        setIsOtherOnline(true)
      }
    })

    newSocket.on('user:online', (data: { userId: string }) => {
      if (other && data.userId === other.id) {
        setIsOtherOnline(true)
        // Mark messages as read since the other user just came online
        newSocket.emit('messages:markRead', {
          byUserId: other.id,
          fromUserId: user.id,
        })
      }
    })

    newSocket.on('user:offline', (data: { userId: string }) => {
      if (other && data.userId === other.id) {
        setIsOtherOnline(false)
      }
    })

    newSocket.on('message:sent', (data: { tempId: string; message: Message }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === data.tempId ? { ...data.message, tempId: undefined, pending: false } : m
        )
      )
    })

    newSocket.on('message:receive', (data: { message: Message }) => {
      setMessages((prev) => {
        const exists = prev.find((m) => m.id === data.message.id)
        if (exists) return prev
        return [...prev, data.message]
      })
      // Mark as read immediately since we're in the chat
      newSocket.emit('messages:markRead', {
        byUserId: user.id,
        fromUserId: data.message.senderId,
      })
      setTimeout(() => scrollToBottom(), 100)
    })

    newSocket.on('messages:read', (data: { byUserId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === user.id && !m.read
            ? { ...m, read: true, readAt: new Date().toISOString() }
            : m
        )
      )
    })

    newSocket.on('message:error', (data: { tempId: string; error: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === data.tempId ? { ...m, pending: false, error: true } : m
        )
      )
    })

    newSocket.on('typing:start', () => setIsTyping(true))
    newSocket.on('typing:stop', () => setIsTyping(false))

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [router, scrollToBottom])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Mark messages as read when we open chat and socket is connected
  useEffect(() => {
    if (socket && currentUser && otherUser && isConnected) {
      socket.emit('messages:markRead', {
        byUserId: currentUser.id,
        fromUserId: otherUser.id,
      })
    }
  }, [socket, currentUser, otherUser, isConnected])

  function sendMessage() {
    if (!socket || !currentUser || !otherUser) return
    if (!inputText.trim() && !selectedImage) return

    const tempId = `temp-${Date.now()}-${Math.random()}`

    if (selectedImage) {
      const tempMsg: Message = {
        id: tempId,
        tempId,
        type: 'IMAGE',
        imageData: selectedImage.data,
        imageType: selectedImage.type,
        createdAt: new Date().toISOString(),
        read: false,
        senderId: currentUser.id,
        receiverId: otherUser.id,
        sender: currentUser,
        receiver: otherUser,
        pending: true,
      }
      setMessages((prev) => [...prev, tempMsg])
      socket.emit('message:send', {
        tempId,
        senderId: currentUser.id,
        receiverId: otherUser.id,
        imageData: selectedImage.data,
        imageType: selectedImage.type,
        type: 'IMAGE',
      })
      setSelectedImage(null)
      setImagePreview(null)
    } else if (inputText.trim()) {
      const tempMsg: Message = {
        id: tempId,
        tempId,
        type: 'TEXT',
        content: inputText.trim(),
        createdAt: new Date().toISOString(),
        read: false,
        senderId: currentUser.id,
        receiverId: otherUser.id,
        sender: currentUser,
        receiver: otherUser,
        pending: true,
      }
      setMessages((prev) => [...prev, tempMsg])
      socket.emit('message:send', {
        tempId,
        senderId: currentUser.id,
        receiverId: otherUser.id,
        content: inputText.trim(),
        type: 'TEXT',
      })
      setInputText('')
    }

    // Stop typing indicator
    if (socket && currentUser && otherUser) {
      socket.emit('typing:stop', { senderId: currentUser.id, receiverId: otherUser.id })
    }

    setTimeout(() => scrollToBottom(), 100)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleTyping(value: string) {
    setInputText(value)
    if (!socket || !currentUser || !otherUser) return

    socket.emit('typing:start', { senderId: currentUser.id, receiverId: otherUser.id })

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { senderId: currentUser.id, receiverId: otherUser.id })
    }, 2000)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      alert('Image must be under 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setImagePreview(base64)
      setSelectedImage({ data: base64, type: file.type })
    }
    reader.readAsDataURL(file)
    if (e.target) e.target.value = ''
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function groupMessages(msgs: Message[]) {
    const groups: { date: string; messages: Message[] }[] = []
    msgs.forEach((msg) => {
      const d = new Date(msg.createdAt)
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      const today = new Date()
      const isToday = d.toDateString() === today.toDateString()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const isYesterday = d.toDateString() === yesterday.toDateString()

      const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : dateStr
      const last = groups[groups.length - 1]
      if (last && last.date === label) {
        last.messages.push(msg)
      } else {
        groups.push({ date: label, messages: [msg] })
      }
    })
    return groups
  }

  function ReadReceipt({ msg }: { msg: Message }) {
    if (msg.senderId !== currentUser?.id) return null
    if (msg.pending) {
      return (
        <svg width="14" height="10" viewBox="0 0 16 11" fill="#8696A0">
          <path d="M11 .5L4.5 7 2 4.5.5 6l4 4L12.5 2 11 .5z" />
        </svg>
      )
    }
    if (msg.read) {
      return (
        <svg width="18" height="11" viewBox="0 0 18 11" fill="#53BDEB">
          <path d="M17.394.YTD.5 15.5 7.5 17 9l-8 8L.5 13.5 2 12l7 7 13.5-13.5 1.5 1.5z" />
          <path d="M1 5.5L5 9.5 13.5 1 15 2.5 5 12.5.5 8 2 6.5l3 3 7-7-1.5-1.5z" />
        </svg>
      )
    }
    return (
      <svg width="18" height="11" viewBox="0 0 18 11" fill="#8696A0">
        <path d="M1 5.5L5 9.5 13.5 1 15 2.5 5 12.5.5 8 2 6.5l3 3 7-7-1.5-1.5z" />
        <path d="M9 5.5L13 9.5 17.5 4 16 2.5 13 6 11.5 4.5 10 6l1.5 1.5L9 9.5z" />
      </svg>
    )
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const groups = groupMessages(messages)

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100dvh',
        background: '#0B141A',
        maxWidth: '100vw',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center px-3 py-2 gap-3 flex-shrink-0"
        style={{ background: '#202C33', minHeight: 60 }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{ background: '#00A884', color: '#fff' }}
        >
          {otherUser?.username?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: '#E9EDEF' }}>
            {otherUser?.username || 'Loading...'}
          </div>
          <div className="text-xs" style={{ color: '#8696A0' }}>
            {isTyping
              ? 'typing...'
              : isOtherOnline
              ? 'online'
              : 'offline'}
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs px-2 py-1 rounded"
          style={{ color: '#8696A0', background: 'transparent' }}
        >
          Logout
        </button>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ background: '#0B141A', overscrollBehavior: 'contain' }}
      >
        <div>
          {groups.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex justify-center my-3">
                <span
                  className="text-xs px-3 py-1 rounded-full"
                  style={{ background: '#1F2C34', color: '#8696A0' }}
                >
                  {group.date}
                </span>
              </div>

              {group.messages.map((msg, i) => {
                const isSent = msg.senderId === currentUser?.id
                const prevMsg = group.messages[i - 1]
                const showTail =
                  !prevMsg || prevMsg.senderId !== msg.senderId

                return (
                  <div
                    key={msg.id || msg.tempId}
                    className={`flex mb-1 ${isSent ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="relative max-w-xs rounded-lg px-3 py-1.5 shadow-sm"
                      style={{
                        background: isSent ? '#005C4B' : '#1F2C34',
                        borderRadius: isSent
                          ? showTail
                            ? '12px 12px 4px 12px'
                            : '12px 12px 4px 12px'
                          : showTail
                          ? '12px 12px 12px 4px'
                          : '12px 12px 12px 4px',
                        maxWidth: '75vw',
                        opacity: msg.pending ? 0.8 : 1,
                      }}
                    >
                      {msg.type === 'IMAGE' && msg.imageData ? (
                        <div>
                          <img
                            src={msg.imageData}
                            alt="Image message"
                            className="rounded-md cursor-pointer"
                            style={{
                              maxWidth: '220px',
                              maxHeight: '220px',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                            onClick={() => setFullImage(msg.imageData || null)}
                          />
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-xs" style={{ color: isSent ? '#B2DFDA' : '#8696A0' }}>
                              {formatTime(msg.createdAt)}
                            </span>
                            <ReadReceipt msg={msg} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-end gap-1 flex-wrap">
                          <span
                            className="text-sm leading-snug break-words"
                            style={{ color: '#E9EDEF', wordBreak: 'break-word', minWidth: 0 }}
                          >
                            {msg.content}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-1 mb-0.5">
                            <span className="text-xs" style={{ color: isSent ? '#B2DFDA' : '#8696A0' }}>
                              {formatTime(msg.createdAt)}
                            </span>
                            <ReadReceipt msg={msg} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start mb-1">
              <div
                className="px-4 py-3 rounded-xl"
                style={{ background: '#1F2C34' }}
              >
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: '#8696A0',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
          style={{ background: '#1F2C34', borderTop: '1px solid #2A3942' }}
        >
          <img
            src={imagePreview}
            alt="Preview"
            className="w-12 h-12 rounded object-cover"
          />
          <span className="text-sm flex-1" style={{ color: '#8696A0' }}>
            Image ready to send
          </span>
          <button
            onClick={() => { setImagePreview(null); setSelectedImage(null) }}
            className="text-lg font-bold"
            style={{ color: '#8696A0' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className="flex items-end gap-2 px-2 py-2 flex-shrink-0"
        style={{ background: '#202C33' }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 p-2 rounded-full transition-colors"
          style={{ color: '#8696A0', background: 'transparent' }}
          title="Attach image"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          rows={1}
          className="flex-1 px-4 py-2 rounded-3xl outline-none resize-none text-sm"
          style={{
            background: '#2A3942',
            color: '#E9EDEF',
            border: 'none',
            maxHeight: 120,
            lineHeight: '1.4',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!inputText.trim() && !selectedImage}
          className="flex-shrink-0 p-2 rounded-full transition-colors"
          style={{
            background: '#00A884',
            color: '#fff',
            opacity: (!inputText.trim() && !selectedImage) ? 0.5 : 1,
          }}
          title="Send"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* Full image modal */}
      {fullImage && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setFullImage(null)}
        >
          <img
            src={fullImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            style={{ maxWidth: '95vw', maxHeight: '95dvh' }}
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl font-light"
            onClick={() => setFullImage(null)}
          >
            ×
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
