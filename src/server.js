const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config();

const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Configure this properly in production
        methods: ["GET", "POST"]
    }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Make io accessible globally or pass it to routes/controllers
app.set('io', io);

async function start() {
    try {
        // Check database connection
        // await prisma.$connect();
        // console.log('Database connected');

        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
