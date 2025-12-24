const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redis = require('./redis');

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // Configure for production needs
            methods: ["GET", "POST"]
        }
    });

    // Setup Redis Adapter (Commented out for local dev without Redis)
    // const pubClient = redis;
    // const subClient = redis.duplicate();
    // io.adapter(createAdapter(pubClient, subClient));

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        // Join Auction Room
        socket.on('joinAuction', (auctionId) => {
            socket.join(`auction:${auctionId}`);
            console.log(`Socket ${socket.id} joined auction:${auctionId}`);
        });

        // Join User Room (for private notifications like outbid)
        socket.on('joinUser', (userId) => {
            socket.join(`user:${userId}`);
            console.log(`Socket ${socket.id} joined user:${userId}`);
        });

        socket.on('leaveAuction', (auctionId) => {
            socket.leave(`auction:${auctionId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

module.exports = { initSocket, getIO };
