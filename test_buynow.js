const { PrismaClient } = require('@prisma/client');
const auctionService = require('./src/services/auctionService');

const prisma = new PrismaClient();

async function test() {
    try {
        const userId = 6;
        const auctionId = 4;
        console.log('Attempting Buy Now for user', userId, 'on auction', auctionId);
        const result = await auctionService.buyNow(userId, auctionId);
        console.log('Success:', result);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

test();
