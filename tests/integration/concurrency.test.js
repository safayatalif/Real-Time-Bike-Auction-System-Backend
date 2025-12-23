const request = require('supertest');
const app = require('../../src/app');
const { registerUser, createAuction } = require('../helpers');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

describe('Auction Concurrency & Idempotency Tests', () => {
    let sellerToken, bidder1Token, bidder2Token;
    let auctionId;

    beforeAll(async () => {
        // Setup unique users
        const suffix = Date.now();
        const seller = await registerUser(`Seller ${suffix}`, `seller${suffix}@test.com`, 'password123', 'SELLER');
        sellerToken = seller.accessToken;

        const b1 = await registerUser(`Bidder1 ${suffix}`, `bidder1${suffix}@test.com`, 'password123', 'BUYER');
        bidder1Token = b1.accessToken;

        const b2 = await registerUser(`Bidder2 ${suffix}`, `bidder2${suffix}@test.com`, 'password123', 'BUYER');
        bidder2Token = b2.accessToken;

        // Create Auction
        const auction = await createAuction(sellerToken, `Race Bike ${suffix}`, 100);
        auctionId = auction.id;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should prevent double bidding with same idempotency key', async () => {
        const key = `key-${Date.now()}`;

        // Send two identical requests
        const req1 = request(app)
            .post('/api/bids')
            .set('Authorization', `Bearer ${bidder1Token}`)
            .send({ auctionId, amount: 110, idempotencyKey: key });

        const req2 = request(app)
            .post('/api/bids')
            .set('Authorization', `Bearer ${bidder1Token}`) // Same user or diff user, same key means duplicate
            .send({ auctionId, amount: 110, idempotencyKey: key });

        const [res1, res2] = await Promise.all([req1, req2]);

        // One should succeed (201), the other might be 200 (existing) or 409 depending on implementation
        // BidService.placeBid logic returns { bid, status: 'EXISTING' } if found.
        // Controller should handle this. Assuming controller returns 200/201.

        // Checking status codes
        // If controller sends 201 for new and 200/409 for existing.
        // We will assert that only 1 bid record exists in DB for this key.

        // Let's actually check the DB count for this amount/auction
        const bids = await prisma.bid.findMany({ where: { auctionId, amount: 110 } });
        // Should be 1
        expect(bids.length).toBe(1);
    });

    test('should handle concurrent competing bids correctly', async () => {
        // Current price is at least 110 (from previous test or 100).
        // Let's force a high concurrency scenario.
        // Bidder 1 tries 150
        // Bidder 2 tries 150
        // Only one should succeed?
        // Or if logic says "amount >= current + inc", both might be valid at moment of check if not locked properly?
        // But with proper locking, the second one will see the updated price and fail if 150 < 150+10?
        // Or if they bid same amount, the first takes it, second sees "Bid too low" (since valid bid must be > current, or same? Usually > in auctions unless it's proxy).
        // Logic says: amount >= currentPrice + minIncrement.
        // So if current is 110. Min inc 10. Required 120.
        // If both bid 130.
        // T1: Reads 110. Writes 130.
        // T2: Reads 130 (if locked property). Fails (130 < 130+10).

        // Let's try sending simultaneous 130 bids.
        const amount = 130;

        const p1 = request(app)
            .post('/api/bids')
            .set('Authorization', `Bearer ${bidder1Token}`)
            .send({ auctionId, amount });

        const p2 = request(app)
            .post('/api/bids')
            .set('Authorization', `Bearer ${bidder2Token}`)
            .send({ auctionId, amount });

        const results = await Promise.all([p1, p2]);

        const successCount = results.filter(r => r.status === 201).length;
        const failCount = results.filter(r => r.status >= 400).length;

        // With proper locking, exactly one enters, updates price. The other enters, sees high price, fails validation.
        expect(successCount).toBe(1);
        expect(failCount).toBe(1);
    });
});
