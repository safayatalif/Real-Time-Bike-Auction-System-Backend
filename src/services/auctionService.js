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

/**
 * Buy Now functionality with concurrency locking
 */
exports.buyNow = async (userId, auctionId) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Lock Auction Row
        const auctionRaw = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${parseInt(auctionId)} FOR UPDATE`;
        const auction = auctionRaw[0];

        if (!auction) throw new Error("Auction not found");

        const auctionModel = await tx.auction.findUnique({ where: { id: parseInt(auctionId) } });

        // 2. Validate
        if (auctionModel.status !== 'LIVE') {
            throw new Error(`Auction is not LIVE`);
        }
        if (!auctionModel.buyNowPrice) {
            throw new Error("This auction does not have a Buy Now price");
        }
        if (auctionModel.sellerId === userId) {
            throw new Error("Seller cannot buy their own item");
        }

        // 3. Create 'Bid' for the BuyNow price (to maintain history/price consistency)
        // Check if there's already a higher bid? Unlikely if we close immediately, but logically possible if concurrency wasn't handled.
        // With lock, we are safe.
        // Also check if current price > buyNowPrice? (Shouldn't happen if buyNow closes instantly, but edge case).
        if (auctionModel.currentPrice >= auctionModel.buyNowPrice) {
            // In rare case bids exceeded buy now (if allowed), buy now shouldn't be valid.
            // But usually Buy Now disappears if bids cross it. enforcing here:
            // Actually, if buy now is fixed, we just take it.
        }

        const validBid = await tx.bid.create({
            data: {
                amount: auctionModel.buyNowPrice,
                auctionId: auctionModel.id,
                bidderId: userId,
                status: 'ACCEPTED',
                rejectionReason: 'BUY_NOW' // Tagging it
            }
        });

        // 4. Update Auction -> ENDED, Winner, Final Price
        const updatedAuction = await tx.auction.update({
            where: { id: auctionModel.id },
            data: {
                status: 'ENDED',
                winnerId: userId,
                currentPrice: auctionModel.buyNowPrice,
                endTime: new Date() // End immediately
            }
        });

        // 5. Notifications
        // Winner
        await tx.notification.create({
            data: {
                userId: userId,
                type: 'AUCTION_WON',
                message: `You successfully purchased ${auctionModel.title} for $${auctionModel.buyNowPrice}!`
            }
        });
        // Seller
        await tx.notification.create({
            data: {
                userId: auctionModel.sellerId,
                type: 'AUCTION_SOLD',
                message: `Your item ${auctionModel.title} was purchased instantly for $${auctionModel.buyNowPrice}!`
            }
        });

        // 6. Audit Log
        await tx.auditLog.create({
            data: {
                action: 'BUY_NOW',
                entity: 'AUCTION',
                entityId: auctionModel.id,
                userId: userId,
                details: { price: auctionModel.buyNowPrice }
            }
        });

        return updatedAuction;
    });
};

// Transition Logic (Scheduled Job)
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
        // TODO: Emit socket event via some global emitter if needed, usually client polls or listens to specific rooms
    }

    // 2. LIVE -> ENDED
    const endingAuctions = await prisma.auction.findMany({
        where: {
            status: 'LIVE',
            endTime: { lte: now }
        }
    });

    for (const auction of endingAuctions) {
        await prisma.$transaction(async (tx) => {
            // Re-fetch with lock to ensure no last-second bids are processing
            // Although 'findMany' above isn't locked, the individual processing below needs care.
            // Using ID check inside transaction is safer.
            const currentAuction = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${auction.id} FOR UPDATE`;
            // $queryRaw returns array of objects with db-specific column names
            // Prisma might map them. Safe to fetch model again after lock.
            const lockedAuction = await tx.auction.findUnique({ where: { id: auction.id } });

            if (lockedAuction.status !== 'LIVE') return;

            // Find highest bid
            const highestBid = await tx.bid.findFirst({
                where: { auctionId: lockedAuction.id, status: 'ACCEPTED' },
                orderBy: { amount: 'desc' }
            });

            let winnerId = null;
            let finalStatus = 'ENDED'; // Could differ if we had UNSOLD status

            if (highestBid) {
                // Check reserve price
                if (!lockedAuction.reservePrice || highestBid.amount >= lockedAuction.reservePrice) {
                    winnerId = highestBid.bidderId;

                    // Notify Winner
                    await tx.notification.create({
                        data: {
                            userId: winnerId,
                            type: 'AUCTION_WON',
                            message: `You won the auction: ${lockedAuction.title} for $${highestBid.amount}!`
                        }
                    });

                    // Notify Seller (Sold)
                    await tx.notification.create({
                        data: {
                            userId: lockedAuction.sellerId,
                            type: 'AUCTION_SOLD',
                            message: `Your auction ${lockedAuction.title} ended with a winning bid of $${highestBid.amount}.`
                        }
                    });
                } else {
                    // Reserve not met
                    // Notify Seller (Unsold)
                    await tx.notification.create({
                        data: {
                            userId: lockedAuction.sellerId,
                            type: 'AUCTION_ENDED',
                            message: `Your auction ${lockedAuction.title} ended. Reserve price was not met. Highest bid: $${highestBid.amount}`
                        }
                    });

                    // Notify Highest Bidder (Lost due to reserve)
                    await tx.notification.create({
                        data: {
                            userId: highestBid.bidderId,
                            type: 'AUCTION_LOST',
                            message: `You had the highest bid on ${lockedAuction.title}, but the reserve price was not met.`
                        }
                    });
                }
            } else {
                // No bids
                await tx.notification.create({
                    data: {
                        userId: lockedAuction.sellerId,
                        type: 'AUCTION_ENDED',
                        message: `Your auction ${lockedAuction.title} ended with no bids.`
                    }
                });
            }

            await tx.auction.update({
                where: { id: lockedAuction.id },
                data: {
                    status: finalStatus,
                    winnerId: winnerId
                }
            });

            await tx.auditLog.create({
                data: {
                    action: 'AUCTION_ENDED',
                    entity: 'AUCTION',
                    entityId: lockedAuction.id,
                    details: { winnerId, finalPrice: highestBid?.amount || 0 }
                }
            });
        });

        await exports.invalidateAuctionCache(auction.id);
        console.log(`Auction ${auction.id} processed and ENDED`);
    }
};
