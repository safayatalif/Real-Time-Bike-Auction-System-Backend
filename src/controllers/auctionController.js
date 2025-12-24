const { PrismaClient } = require('@prisma/client');
const auctionService = require('../services/auctionService');

const prisma = new PrismaClient();

// Create Auction
exports.createAuction = async (req, res) => {
    try {
        const { title, description, images, startTime, endTime, startingPrice, minIncrement, reservePrice, buyNowPrice } = req.body;
        const sellerId = req.user.id; // From auth middleware

        // Basic date validation
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (start < new Date()) {
            // Optional: allow creating live auctions immediately, or force scheduled
            // return res.status(400).json({ error: "Start time must be in the future" });
        }
        if (end <= start) {
            return res.status(400).json({ error: "End time must be after start time" });
        }

        const auction = await prisma.auction.create({
            data: {
                title,
                description,
                images: images || [],
                startTime: start,
                endTime: end,
                startingPrice,
                currentPrice: startingPrice, // Start equals base
                minIncrement,
                reservePrice,
                buyNowPrice,
                status: start <= new Date() ? 'LIVE' : 'SCHEDULED', // Auto-live if time matches
                sellerId
            }
        });

        // Audit Log
        await prisma.auditLog.create({
            data: {
                action: 'AUCTION_CREATED',
                entity: 'AUCTION',
                entityId: auction.id,
                userId: sellerId,
                details: { title: auction.title }
            }
        });

        res.status(201).json(auction);
    } catch (error) {
        console.error('Create auction error:', error);
        res.status(500).json({ error: "Failed to create auction" });
    }
};

// List Auctions (Filtering)
exports.listAuctions = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const where = {};
        if (status) {
            where.status = status;
        } else {
            // Default: show Live and Scheduled (exclude Draft/Ended unless asked)
            where.status = { in: ['LIVE', 'SCHEDULED'] };
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [auctions, total] = await prisma.$transaction([
            prisma.auction.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(limit),
                orderBy: { endTime: 'asc' }, // Ending soonest first
                include: { _count: { select: { bids: true } } }
            }),
            prisma.auction.count({ where })
        ]);

        res.json({
            data: auctions,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('List auctions error:', error);
        res.status(500).json({ error: "Failed to fetch auctions" });
    }
};

// Get Seller's Auctions
exports.getSellerAuctions = async (req, res) => {
    try {
        const sellerId = req.user.id;

        const auctions = await prisma.auction.findMany({
            where: { sellerId },
            include: {
                _count: { select: { bids: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(auctions);
    } catch (error) {
        console.error('Get seller auctions error:', error);
        res.status(500).json({ error: "Failed to fetch seller auctions" });
    }
};

// Get Auctions User Bid On
exports.getUserBids = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find auctions where user has at least one bid
        const auctions = await prisma.auction.findMany({
            where: {
                bids: {
                    some: { bidderId: userId }
                }
            },
            include: {
                _count: { select: { bids: true } }
            },
            orderBy: { endTime: 'asc' }
        });

        res.json(auctions);
    } catch (error) {
        console.error('Get user bids error:', error);
        res.status(500).json({ error: "Failed to fetch your bids" });
    }
};

// Get Single Auction
exports.getAuction = async (req, res) => {
    try {
        const { id } = req.params;
        const auction = await auctionService.getAuctionById(id);

        if (!auction) {
            return res.status(404).json({ error: "Auction not found" });
        }

        // Hide Reserve Price if user is not seller
        if (req.user?.id !== auction.sellerId) {
            delete auction.reservePrice;
        }

        res.json(auction);
    } catch (error) {
        console.error('Get auction error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Update Auction (Draft only)
exports.updateAuction = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const userId = req.user.id;

        const auction = await prisma.auction.findUnique({ where: { id: parseInt(id) } });
        if (!auction) return res.status(404).json({ error: "Auction not found" });

        if (auction.sellerId !== userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        if (auction.status !== 'DRAFT' && auction.status !== 'SCHEDULED') {
            return res.status(400).json({ error: "Cannot edit an auction that is Live or Ended" });
        }

        const updated = await prisma.auction.update({
            where: { id: parseInt(id) },
            data: {
                ...data,
                updatedAt: new Date()
            }
        });

        await auctionService.invalidateAuctionCache(id);
        res.json(updated);

    } catch (error) {
        console.error('Update auction error:', error);
        res.status(500).json({ error: "Update failed" });
    }
};

// Cancel Auction
exports.cancelAuction = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body; // Optional reason
        const userId = req.user.id;

        const auction = await prisma.auction.findUnique({ where: { id: parseInt(id) } });
        if (!auction) return res.status(404).json({ error: "Auction not found" });

        if (auction.sellerId !== userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: "Unauthorized" });
        }

        if (auction.status === 'ENDED' || auction.status === 'CANCELED') {
            return res.status(400).json({ error: "Auction is already closed" });
        }

        const updated = await prisma.auction.update({
            where: { id: parseInt(id) },
            data: { status: 'CANCELED' }
        });

        await auctionService.invalidateAuctionCache(id);

        // Audit Log
        await prisma.auditLog.create({
            data: {
                action: 'AUCTION_CANCELED',
                entity: 'AUCTION',
                entityId: auction.id,
                userId: userId,
                details: { reason }
            }
        });

        res.json({ message: "Auction canceled", auction: updated });

    } catch (error) {
        console.error('Cancel auction error:', error);
        res.status(500).json({ error: "Cancel failed" });
    }
};

// Buy Now
exports.buyNow = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const updatedAuction = await auctionService.buyNow(userId, id);

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('auctionEnded', {
                auctionId: updatedAuction.id,
                winnerId: userId,
                finalPrice: updatedAuction.currentPrice,
                reason: 'BUY_NOW'
            });
        }

        await auctionService.invalidateAuctionCache(id);

        res.json({ message: "Purchase successful", auction: updatedAuction });
    } catch (error) {
        console.error('Buy Now error:', error.message);
        res.status(400).json({ error: error.message });
    }
};
