const http = require('http');
const app = require('./app');
const startScheduler = require('./jobs/auctionScheduler');

require('dotenv').config();

const PORT = process.env.PORT || 5000;
const { initSocket } = require('./config/socket');

const server = http.createServer(app);
const io = initSocket(server);

// Make io accessible globally via app (optional, as we have getIO)
app.set('io', io);

async function start() {
    try {
        // Check database connection
        // await prisma.$connect();
        // console.log('Database connected');

        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            startScheduler();
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
