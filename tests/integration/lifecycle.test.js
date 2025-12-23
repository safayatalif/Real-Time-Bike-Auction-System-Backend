const request = require('supertest');
const app = require('../../src/app');
const { registerUser, createAuction } = require('../helpers');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

describe('Auction Lifecycle Tests', () => {
    let sellerToken, buyerToken, auctionId;

    beforeAll(async () => {
        const suffix = Date.now() + 'L';
        const seller = await registerUser(`Seller ${suffix}`, `seller${suffix}@test.com`, 'password123', 'SELLER');
        sellerToken = seller.accessToken;
        const buyer = await registerUser(`Buyer ${suffix}`, `buyer${suffix}@test.com`, 'password123', 'BUYER');
        buyerToken = buyer.accessToken;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should allow Buy Now to close auction immediately', async () => {
        // Create auction with BuyNow price
        const auctionRes = await request(app)
            .post('/api/auctions')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
                title: 'Buy Now Bike',
                description: 'Fast sale',
                startingPrice: 100,
                minIncrement: 10,
                buyNowPrice: 200,
                startTime: new Date().toISOString(),
                endTime: new Date(Date.now() + 100000).toISOString()
            });

        const auctionId = auctionRes.body.id;

        // Buy Now
        const res = await request(app)
            .post(`/api/auctions/${auctionId}/buy-now`)
            .set('Authorization', `Bearer ${buyerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.auction.status).toBe('ENDED');
        expect(res.body.auction.winnerId).toBeDefined();

        // Verify notification (optional check in DB if needed, but status is good signal)
    });
});
