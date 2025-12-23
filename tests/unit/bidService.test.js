const bidService = require('../../src/services/bidService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Mock Redis
jest.mock('../../src/config/redis', () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn()
}));

jest.mock('@prisma/client', () => {
    const mPrisma = {
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn((callback) => callback(mPrisma)),
        $queryRaw: jest.fn(),
        auction: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        bid: {
            count: jest.fn(),
            create: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn()
        },
        notification: {
            create: jest.fn()
        },
        auditLog: {
            create: jest.fn()
        }
    };
    return { PrismaClient: jest.fn(() => mPrisma) };
});

describe('BidService Unit Tests', () => {
    let mockTx;

    beforeEach(() => {
        jest.clearAllMocks();
        mockTx = new PrismaClient();
    });

    test('should reject bid if auction is not live', async () => {
        mockTx.$queryRaw.mockResolvedValue([{ id: 1, status: 'ENDED' }]);

        await expect(bidService.placeBid(1, 1, 100, 'key')).rejects.toThrow('Auction is not LIVE');
    });

    test('should reject self-bidding', async () => {
        mockTx.$queryRaw.mockResolvedValue([{ id: 1, status: 'LIVE', startTime: new Date(), endTime: new Date(Date.now() + 10000), sellerId: 1 }]);

        await expect(bidService.placeBid(1, 1, 100, 'key')).rejects.toThrow('Sellers cannot bid on their own auctions');
    });

    test('should extension auction if bid placed near end (Anti-Sniping)', async () => {
        const now = new Date();
        const endTime = new Date(now.getTime() + 60000); // 1 minute left
        const auctionObj = {
            id: 1,
            status: 'LIVE',
            startTime: new Date(now.getTime() - 10000),
            endTime: endTime,
            sellerId: 2,
            currentPrice: { add: () => 10, toString: () => '10' },
            minIncrement: 10,
            startingPrice: 10
        };

        mockTx.$queryRaw.mockResolvedValue([auctionObj]); // Locked row
        mockTx.auction.findUnique.mockResolvedValue(auctionObj); // Re-fetch
        mockTx.bid.count.mockResolvedValue(1);
        mockTx.bid.create.mockResolvedValue({ id: 100, amount: 150 });
        mockTx.auction.update.mockResolvedValue({ ...auctionObj, endTime: new Date(endTime.getTime() + 120000) });

        const result = await bidService.placeBid(1, 1, 150, 'key');

        expect(result.extended).toBe(true);
        expect(mockTx.auction.update).toBeCalled();
    });
});
