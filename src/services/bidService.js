const { PrismaClient } = require('@prisma/client');
const redis = require('../config/redis');
const auctionService = require('./auctionService');

const prisma = new PrismaClient();

const EXTENSION_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const EXTENSION_TIME_MS = 2 * 60 * 1000;   // 2 minutes

// Helper to access Socket.IO
const getIO = (req) => req.app.get('io');

exports.placeBid = async (userId, auctionId, amount, idempotencyKey, req) => {
    // 1. Idempotency Check
    if (idempotencyKey) {
        const existingBid = await prisma.bid.findUnique({
            where: { idempotencyKey }
        });
        if (existingBid) {
            return { bid: existingBid, status: 'EXISTING' };
        }
    }

    // 2. Transaction for Concurrency
    return await prisma.$transaction(async (tx) => {
        // Lock the auction row to prevent race conditions
        // Note: Raw query for Postgres locking
        const auctionRaw = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${parseInt(auctionId)} FOR UPDATE`;
        const auction = auctionRaw[0];

        if (!auction) throw new Error("Auction not found");

        const now = new Date();

        // 3. Validations
        // Check Status
        if (auction.status !== 'LIVE') {
            throw new Error(`Auction is not LIVE (Status: ${auction.status})`);
        }

        // Check Time
        if (new Date(auction.startTime) > now || new Date(auction.endTime) < now) {
            throw new Error("Bidding window is closed");
        }

        // Check Self-Bidding
        if (auction.sellerId === userId) {
            throw new Error("Sellers cannot bid on their own auctions");
        }

        // Check Amount
        // Convert Decimal/string to Number for comparison (careful with precision, but JS Number is distinct from Prisma Decimal)
        // Best to use Decimal methods if available, but raw query returns numbers/strings depending on driver.
        // Prisma Client returns Decimal objects. Raw query might return numbers.
        // Let's re-fetch with Prisma Client inside transaction to get proper Decimal objects, 
        // relying on the Row Lock established by the raw query.
        const auctionObj = await tx.auction.findUnique({ where: { id: auction.id } });

        const currentPrice = auctionObj.currentPrice; // This might be starting price if no bids, OR highest bid
        const minIncrement = auctionObj.minIncrement;
        const bidAmount = amount; // Assumption: amount is Decimal-compatible or number

        // If no bids yet, first bid must be >= startingPrice.
        // If bids exist, must be >= currentPrice + minIncrement.
        // Logic: The 'currentPrice' in Auction model tracks the highest bid (or starting price).
        // Spec usually says: If 0 bids, >= startingPrice. If >0 bids, >= currentPrice + increment.

        // Let's check if there are existing bids to be sure, or rely on currentPrice logic
        const bidCount = await tx.bid.count({ where: { auctionId: auction.id, status: 'ACCEPTED' } });

        let minRequired;
        if (bidCount === 0) {
            minRequired = auctionObj.startingPrice;
        } else {
            // Using Prisma Decimal methods: .add()
            minRequired = currentPrice.add(minIncrement);
        }

        // Compare: amount >= minRequired
        // Using Decimal.gte()
        // Ensure input 'amount' is converted to Decimal string/number for comparison
        if (parseFloat(amount) < parseFloat(minRequired)) {
            throw new Error(`Bid too low. Minimum valid bid is ${minRequired}`);
        }

        // 4. Place Bid
        const newBid = await tx.bid.create({
            data: {
                amount: amount,
                auctionId: auction.id,
                bidderId: userId,
                status: 'ACCEPTED',
                idempotencyKey: idempotencyKey
            }
        });

        // 5. Update Auction (Price & Anti-Sniping)
        const updates = {
            currentPrice: amount,
            // Optimization: Track winnerId here for easy access?
            // winnerId: userId  (Usually set at end, but tracking 'currentLeader' is useful)
        };

        // Anti-Sniping check
        const timeRemaining = new Date(auctionObj.endTime).getTime() - now.getTime();
        let extended = false;
        if (timeRemaining < EXTENSION_WINDOW_MS) {
            updates.endTime = new Date(new Date(auctionObj.endTime).getTime() + EXTENSION_TIME_MS);
            extended = true;
        }

        const updatedAuction = await tx.auction.update({
            where: { id: auction.id },
            data: updates,
            include: { _count: { select: { bids: true } } }
        });

        // 6. Audit Log
        await tx.auditLog.create({
            data: {
                action: 'BID_PLACED',
                entity: 'BID',
                entityId: newBid.id,
                userId: userId,
                auctionId: auction.id,
                details: { amount, status: 'ACCEPTED', extended }
            }
        });

        // 7. Side Effects (Notifications/Socket) - run AFTER tx usually, but for consistency here is fine
        // Return data for controller to emit
        return { bid: newBid, auction: updatedAuction, extended };
    });
};

exports.getBidHistory = async (auctionId) => {
    return await prisma.bid.findMany({
        where: {
            auctionId: parseInt(auctionId),
            status: 'ACCEPTED'
        },
        orderBy: { amount: 'desc' },
        include: {
            bidder: {
                select: { id: true, name: true } // Don't expose email
            }
        }
    });
};
