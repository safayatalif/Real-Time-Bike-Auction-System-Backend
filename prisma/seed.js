const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // 1. Clean up relevant tables
    // Careful in production!
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.user.deleteMany();

    // 2. Hash Password
    const password = await bcrypt.hash('password123', 10);

    // 3. Create Users
    const admin = await prisma.user.create({
        data: {
            email: 'admin@bikebid.com',
            password,
            name: 'System Admin',
            role: 'ADMIN',
            status: 'ACTIVE'
        }
    });

    const seller = await prisma.user.create({
        data: {
            email: 'seller@bikebid.com',
            password,
            name: 'Pro Bike Shop',
            role: 'SELLER',
            status: 'ACTIVE'
        }
    });

    const buyer1 = await prisma.user.create({
        data: {
            email: 'buyer1@bikebid.com',
            password,
            name: 'Alice Racer',
            role: 'BUYER',
            status: 'ACTIVE'
        }
    });

    const buyer2 = await prisma.user.create({
        data: {
            email: 'buyer2@bikebid.com',
            password,
            name: 'Bob Commuter',
            role: 'BUYER',
            status: 'ACTIVE'
        }
    });

    console.log('✅ Users created');

    // 4. Create Auctions
    const now = new Date();

    // Live Auction
    await prisma.auction.create({
        data: {
            title: 'Specialized Tarmac SL7 Pro - Carbon Frame',
            description: 'Top tier road bike used for one season. Excellent condition, new tires. Shimano Ultegra Di2 groupset.',
            images: [
                'https://images.unsplash.com/photo-1532298229144-0ec0c57c15e9?auto=format&fit=crop&q=80&w=1000',
                'https://images.unsplash.com/photo-1507035895480-2b3156c311a6?auto=format&fit=crop&q=80&w=1000'
            ],
            startTime: now,
            endTime: new Date(now.getTime() + 1000 * 60 * 60 * 48), // +48 hours
            startingPrice: 2500,
            minIncrement: 50,
            reservePrice: 3000,
            buyNowPrice: 4500,
            status: 'LIVE',
            currentPrice: 2500,
            sellerId: seller.id
        }
    });

    // Scheduled Auction
    await prisma.auction.create({
        data: {
            title: 'Vintage 1985 Bianchi',
            description: 'Classic steel frame Italian race bike. Original Campagnolo components. A collector\'s dream.',
            images: [
                'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&q=80&w=1000'
            ],
            startTime: new Date(now.getTime() + 1000 * 60 * 60 * 24), // +24 hours
            endTime: new Date(now.getTime() + 1000 * 60 * 60 * 72),
            startingPrice: 800,
            minIncrement: 20,
            status: 'SCHEDULED',
            currentPrice: 800,
            sellerId: seller.id
        }
    });

    // Ending Soon Auction
    await prisma.auction.create({
        data: {
            title: 'Trek Marlin 7 - Mountain Bike',
            description: 'Solid hardtail MTB for trails. RockShox suspension. Minor scratches on frame.',
            images: [
                'https://images.unsplash.com/photo-1576435728678-be95e39e565d?auto=format&fit=crop&q=80&w=1000'
            ],
            startTime: new Date(now.getTime() - 1000 * 60 * 60 * 23), // Started 23h ago
            endTime: new Date(now.getTime() + 1000 * 60 * 30), // Ends in 30 mins
            startingPrice: 400,
            minIncrement: 25,
            status: 'LIVE',
            currentPrice: 400,
            sellerId: seller.id
        }
    });

    console.log('✅ Auctions created');
    console.log('🚀 Seed complete! Login with: admin@bikebid.com / password123');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
