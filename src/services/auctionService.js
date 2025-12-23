const { PrismaClient } = require('@prisma/client');
const redis = require('../config/redis');

const prisma = new PrismaClient();
const CACHE_TTL = 300; // 5 minutes

// Helper to handle BigInt/Decimal serialization for Redis
const jsonReplacer = (key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (value && typeof value === 'object' && value.constructor.name === 'Decimal') return value.toString();
    return value;
};

exports.getAuctionById = async (id) => {
    const cacheKey = `auction:${id}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
        return JSON.parse(cached);
    }

    const auction = await prisma.auction.findUnique({
        where: { id: parseInt(id) },
        include: {
            seller: { select: { id: true, name: true, email: true } },
            _count: { select: { bids: true } }
        }
    });

    if (auction) {
        await redis.set(cacheKey, JSON.stringify(auction, jsonReplacer), 'EX', CACHE_TTL);
    }

    return auction;
};

exports.cacheAuction = async (auction) => {
    if (!auction) return;
    const cacheKey = `auction:${auction.id}`;
    await redis.set(cacheKey, JSON.stringify(auction, jsonReplacer), 'EX', CACHE_TTL);
};

exports.invalidateAuctionCache = async (id) => {
    await redis.del(`auction:${id}`);
};

// Transition Logic
exports.transitionAuctions = async () => {
    const now = new Date();

    // 1. SCHEDULED -> LIVE
    const startingAuctions = await prisma.auction.findMany({
        where: {
            status: 'SCHEDULED',
            startTime: { lte: now }
        }
    });

    for (const auction of startingAuctions) {
        await prisma.auction.update({
            where: { id: auction.id },
            data: { status: 'LIVE' }
        });
        await exports.invalidateAuctionCache(auction.id);
        console.log(`Auction ${auction.id} is now LIVE`);
        // TODO: Emit socket event
    }

    // 2. LIVE -> ENDED
    // Note: Anti-sniping logic might extend endTime, so we strictly check endTime <= now
    const endingAuctions = await prisma.auction.findMany({
        where: {
            status: 'LIVE',
            endTime: { lte: now }
        }
    });

    for (const auction of endingAuctions) {
        // Run winner determination transaction
        await prisma.$transaction(async (tx) => {
            // Re-fetch to be safe within transaction
            const currentAuction = await tx.auction.findUnique({ where: { id: auction.id } });
            if (currentAuction.status !== 'LIVE') return; // Already processed

            // Find highest bid
            const highestBid = await tx.bid.findFirst({
                where: { auctionId: currentAuction.id, status: 'ACCEPTED' },
                orderBy: { amount: 'desc' }
            });

            let winnerId = null;
            let finalStatus = 'ENDED';

            if (highestBid) {
                // Check reserve price
                if (!currentAuction.reservePrice || highestBid.amount.gte(currentAuction.reservePrice)) {
                    winnerId = highestBid.bidderId;
                } else {
                    // Reserve not met
                    console.log(`Auction ${auction.id} ended but reserve not met.`);
                }
            }

            await tx.auction.update({
                where: { id: auction.id },
                data: {
                    status: finalStatus,
                    winnerId: winnerId
                }
            });

            // Create Notification for winner/seller (Mock for now)
            if (winnerId) {
                await tx.notification.create({
                    data: {
                        userId: winnerId,
                        type: 'AUCTION_WON',
                        message: `You won the auction: ${currentAuction.title}!`
                    }
                });
            }
        });

        await exports.invalidateAuctionCache(auction.id);
        console.log(`Auction ${auction.id} is now ENDED`);
        // TODO: Emit socket event
    }
};
