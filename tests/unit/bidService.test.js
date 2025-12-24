const bidService = require('../../src/services/bidService');

// Define mockPrisma BEFORE using it in jest.mock
const mockPrisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((callback) => callback(mockPrisma)),
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

// Mock Redis
jest.mock('../../src/config/redis', () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn()
}));

// Mock PrismaClient constructor
jest.mock('@prisma/client', () => {
    return {
        PrismaClient: jest.fn(() => mockPrisma)
    };
});

describe('BidService Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should reject bid if auction is not live', async () => {
        mockPrisma.$queryRaw.mockResolvedValue([{ id: 1, status: 'ENDED' }]);

        await expect(bidService.placeBid(1, 1, 100, 'key')).rejects.toThrow('Auction is not LIVE');
    });

    test('should reject self-bidding', async () => {
        mockPrisma.$queryRaw.mockResolvedValue([{ id: 1, status: 'LIVE', startTime: new Date(), endTime: new Date(Date.now() + 10000), sellerId: 1 }]);

        await expect(bidService.placeBid(1, 1, 100, 'key')).rejects.toThrow('Sellers cannot bid on their own auctions');
    });

    test('should extend auction if bid placed near end (Anti-Sniping)', async () => {
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

        mockPrisma.$queryRaw.mockResolvedValue([auctionObj]); // Locked row
        mockPrisma.auction.findUnique.mockResolvedValue(auctionObj); // Re-fetch
        mockPrisma.bid.count.mockResolvedValue(1);
        mockPrisma.bid.create.mockResolvedValue({ id: 100, amount: 150 });
        mockPrisma.auction.update.mockResolvedValue({ ...auctionObj, endTime: new Date(endTime.getTime() + 120000) });

        const result = await bidService.placeBid(1, 1, 150, 'key');

        expect(result.extended).toBe(true);
        expect(mockPrisma.auction.update).toBeCalled();
    });
});
