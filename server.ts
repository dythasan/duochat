import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const prisma = new PrismaClient()

interface SocketUser {
  socketId: string
  userId: string
  username: string
}

const connectedUsers: Map<string, SocketUser> = new Map()

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for images
  })

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id)

    socket.on('user:join', async (data: { userId: string; username: string }) => {
      connectedUsers.set(data.userId, {
        socketId: socket.id,
        userId: data.userId,
        username: data.username,
      })
      socket.data.userId = data.userId
      socket.data.username = data.username

      // Notify the other user this person is online
      connectedUsers.forEach((user, uid) => {
        if (uid !== data.userId) {
          const otherSocket = io.sockets.sockets.get(user.socketId)
          if (otherSocket) {
            otherSocket.emit('user:online', { userId: data.userId, username: data.username })
          }
        }
      })

      // Tell this user who is online
      const onlineUsers: string[] = []
      connectedUsers.forEach((user, uid) => {
        if (uid !== data.userId) onlineUsers.push(uid)
      })
      socket.emit('users:online', onlineUsers)

      // Mark unread messages as read when user comes online
      try {
        await prisma.message.updateMany({
          where: {
            receiverId: data.userId,
            read: false,
          },
          data: {
            read: true,
            readAt: new Date(),
          },
        })
        // Notify sender that messages are now read
        const unreadMessages = await prisma.message.findMany({
          where: { receiverId: data.userId, read: true, readAt: { not: null } },
          select: { id: true, senderId: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
        const senderIds = new Set(unreadMessages.map((m) => m.senderId))
        senderIds.forEach((senderId) => {
          const senderUser = connectedUsers.get(senderId)
          if (senderUser) {
            const senderSocket = io.sockets.sockets.get(senderUser.socketId)
            if (senderSocket) {
              senderSocket.emit('messages:read', { byUserId: data.userId })
            }
          }
        })
      } catch (err) {
        console.error('Error marking messages read on join:', err)
      }
    })

    socket.on('message:send', async (data: {
      tempId: string
      senderId: string
      receiverId: string
      content?: string
      imageData?: string
      imageType?: string
      type: 'TEXT' | 'IMAGE'
    }) => {
      try {
        const message = await prisma.message.create({
          data: {
            content: data.content,
            imageData: data.imageData,
            imageType: data.imageType,
            type: data.type,
            senderId: data.senderId,
            receiverId: data.receiverId,
            read: false,
          },
          include: {
            sender: { select: { id: true, username: true } },
            receiver: { select: { id: true, username: true } },
          },
        })

        // Confirm to sender
        socket.emit('message:sent', { tempId: data.tempId, message })

        // Send to receiver if online
        const receiverUser = connectedUsers.get(data.receiverId)
        if (receiverUser) {
          const receiverSocket = io.sockets.sockets.get(receiverUser.socketId)
          if (receiverSocket) {
            receiverSocket.emit('message:receive', { message })

            // If receiver is online, mark as read immediately
            await prisma.message.update({
              where: { id: message.id },
              data: { read: true, readAt: new Date() },
            })
            socket.emit('messages:read', { byUserId: data.receiverId })
          }
        }
      } catch (err) {
        console.error('Error saving message:', err)
        socket.emit('message:error', { tempId: data.tempId, error: 'Failed to send message' })
      }
    })

    socket.on('messages:markRead', async (data: { byUserId: string; fromUserId: string }) => {
      try {
        await prisma.message.updateMany({
          where: {
            senderId: data.fromUserId,
            receiverId: data.byUserId,
            read: false,
          },
          data: { read: true, readAt: new Date() },
        })

        // Notify sender
        const senderUser = connectedUsers.get(data.fromUserId)
        if (senderUser) {
          const senderSocket = io.sockets.sockets.get(senderUser.socketId)
          if (senderSocket) {
            senderSocket.emit('messages:read', { byUserId: data.byUserId })
          }
        }
      } catch (err) {
        console.error('Error marking messages as read:', err)
      }
    })

    socket.on('typing:start', (data: { senderId: string; receiverId: string }) => {
      const receiverUser = connectedUsers.get(data.receiverId)
      if (receiverUser) {
        const receiverSocket = io.sockets.sockets.get(receiverUser.socketId)
        if (receiverSocket) {
          receiverSocket.emit('typing:start', { userId: data.senderId })
        }
      }
    })

    socket.on('typing:stop', (data: { senderId: string; receiverId: string }) => {
      const receiverUser = connectedUsers.get(data.receiverId)
      if (receiverUser) {
        const receiverSocket = io.sockets.sockets.get(receiverUser.socketId)
        if (receiverSocket) {
          receiverSocket.emit('typing:stop', { userId: data.senderId })
        }
      }
    })

    socket.on('disconnect', () => {
      const userId = socket.data.userId
      if (userId) {
        connectedUsers.delete(userId)
        // Notify others
        connectedUsers.forEach((user) => {
          const otherSocket = io.sockets.sockets.get(user.socketId)
          if (otherSocket) {
            otherSocket.emit('user:offline', { userId })
          }
        })
      }
      console.log('Client disconnected:', socket.id)
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
