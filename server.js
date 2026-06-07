"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const url_1 = require("url");
const next_1 = __importDefault(require("next"));
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
const web_push_1 = __importDefault(require("web-push"));
const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const app = (0, next_1.default)({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new client_1.PrismaClient();
// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:info@duochat.app';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    web_push_1.default.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
else {
    console.warn('VAPID keys not configured — push notifications disabled');
}
const connectedUsers = new Map();
async function sendPushToUser(userId) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
        return;
    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId },
        });
        const payload = JSON.stringify({
            title: 'Not',
            body: 'Yeni mesaj',
            url: '/chat',
        });
        for (const sub of subscriptions) {
            try {
                await web_push_1.default.sendNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                }, payload);
            }
            catch (err) {
                // Remove expired/invalid subscriptions (410 = Gone)
                const status = err.statusCode;
                if (status === 410 || status === 404) {
                    await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => { });
                }
                else {
                    console.error('Push send error:', err);
                }
            }
        }
    }
    catch (err) {
        console.error('Error fetching push subscriptions:', err);
    }
}
app.prepare().then(() => {
    const httpServer = (0, http_1.createServer)(async (req, res) => {
        try {
            const parsedUrl = (0, url_1.parse)(req.url, true);
            await handle(req, res, parsedUrl);
        }
        catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for images
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['polling', 'websocket'],
        allowUpgrades: true,
    });
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        socket.on('user:join', async (data) => {
            connectedUsers.set(data.userId, {
                socketId: socket.id,
                userId: data.userId,
                username: data.username,
                isActive: true, // assume active on join
            });
            socket.data.userId = data.userId;
            socket.data.username = data.username;
            // Notify the other user this person is online
            connectedUsers.forEach((user, uid) => {
                if (uid !== data.userId) {
                    const otherSocket = io.sockets.sockets.get(user.socketId);
                    if (otherSocket) {
                        otherSocket.emit('user:online', { userId: data.userId, username: data.username });
                    }
                }
            });
            // Tell this user who is online
            const onlineUsers = [];
            connectedUsers.forEach((user, uid) => {
                if (uid !== data.userId)
                    onlineUsers.push(uid);
            });
            socket.emit('users:online', onlineUsers);
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
                });
                // Notify sender that messages are now read
                const unreadMessages = await prisma.message.findMany({
                    where: { receiverId: data.userId, read: true, readAt: { not: null } },
                    select: { id: true, senderId: true },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                });
                const senderIds = new Set(unreadMessages.map((m) => m.senderId));
                senderIds.forEach((senderId) => {
                    const senderUser = connectedUsers.get(senderId);
                    if (senderUser) {
                        const senderSocket = io.sockets.sockets.get(senderUser.socketId);
                        if (senderSocket) {
                            senderSocket.emit('messages:read', { byUserId: data.userId });
                        }
                    }
                });
            }
            catch (err) {
                console.error('Error marking messages read on join:', err);
            }
        });
        // Track visibility state
        socket.on('user:active', (data) => {
            const user = connectedUsers.get(data.userId);
            if (user) {
                user.isActive = true;
                connectedUsers.set(data.userId, user);
            }
        });
        socket.on('user:inactive', (data) => {
            const user = connectedUsers.get(data.userId);
            if (user) {
                user.isActive = false;
                connectedUsers.set(data.userId, user);
            }
        });
        socket.on('message:send', async (data) => {
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
                });
                // Confirm to sender
                socket.emit('message:sent', { tempId: data.tempId, message });
                // Send to receiver if online
                const receiverUser = connectedUsers.get(data.receiverId);
                if (receiverUser) {
                    const receiverSocket = io.sockets.sockets.get(receiverUser.socketId);
                    if (receiverSocket) {
                        receiverSocket.emit('message:receive', { message });
                        // If receiver is online AND active (page visible), mark as read immediately
                        if (receiverUser.isActive) {
                            await prisma.message.update({
                                where: { id: message.id },
                                data: { read: true, readAt: new Date() },
                            });
                            socket.emit('messages:read', { byUserId: data.receiverId });
                        }
                        else {
                            // Receiver is connected but page is hidden — send push notification
                            await sendPushToUser(data.receiverId);
                        }
                    }
                }
                else {
                    // Receiver is completely offline — send push notification
                    await sendPushToUser(data.receiverId);
                }
            }
            catch (err) {
                console.error('Error saving message:', err);
                socket.emit('message:error', { tempId: data.tempId, error: 'Failed to send message' });
            }
        });
        socket.on('messages:markRead', async (data) => {
            try {
                await prisma.message.updateMany({
                    where: {
                        senderId: data.fromUserId,
                        receiverId: data.byUserId,
                        read: false,
                    },
                    data: { read: true, readAt: new Date() },
                });
                // Notify sender
                const senderUser = connectedUsers.get(data.fromUserId);
                if (senderUser) {
                    const senderSocket = io.sockets.sockets.get(senderUser.socketId);
                    if (senderSocket) {
                        senderSocket.emit('messages:read', { byUserId: data.byUserId });
                    }
                }
            }
            catch (err) {
                console.error('Error marking messages as read:', err);
            }
        });
        socket.on('typing:start', (data) => {
            const receiverUser = connectedUsers.get(data.receiverId);
            if (receiverUser) {
                const receiverSocket = io.sockets.sockets.get(receiverUser.socketId);
                if (receiverSocket) {
                    receiverSocket.emit('typing:start', { userId: data.senderId });
                }
            }
        });
        socket.on('typing:stop', (data) => {
            const receiverUser = connectedUsers.get(data.receiverId);
            if (receiverUser) {
                const receiverSocket = io.sockets.sockets.get(receiverUser.socketId);
                if (receiverSocket) {
                    receiverSocket.emit('typing:stop', { userId: data.senderId });
                }
            }
        });
        socket.on('disconnect', () => {
            const userId = socket.data.userId;
            if (userId) {
                connectedUsers.delete(userId);
                // Notify others
                connectedUsers.forEach((user) => {
                    const otherSocket = io.sockets.sockets.get(user.socketId);
                    if (otherSocket) {
                        otherSocket.emit('user:offline', { userId });
                    }
                });
            }
            console.log('Client disconnected:', socket.id);
        });
    });
    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});
