const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.addToWatchlist = async (req, res) => {
    try {
        const { auctionId } = req.body;
        const userId = req.user.id;

        if (!auctionId) {
            return res.status(400).json({ error: 'Auction ID is required' });
        }

        // Check if auction exists
        const auction = await prisma.auction.findUnique({
            where: { id: parseInt(auctionId) }
        });

        if (!auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }

        // Check if already in watchlist
        const existing = await prisma.watchlist.findUnique({
            where: {
                userId_auctionId: {
                    userId,
                    auctionId: parseInt(auctionId)
                }
            }
        });

        if (existing) {
            return res.status(200).json({ message: 'Already in watchlist', watchlist: existing });
        }

        const watchlist = await prisma.watchlist.create({
            data: {
                userId,
                auctionId: parseInt(auctionId)
            },
            include: {
                auction: {
                    select: {
                        id: true,
                        title: true,
                        currentPrice: true,
                        endTime: true,
                        status: true
                    }
                }
            }
        });

        res.status(201).json(watchlist);
    } catch (error) {
        console.error('Add to watchlist error:', error);
        res.status(500).json({ error: 'Failed to add to watchlist' });
    }
};

exports.removeFromWatchlist = async (req, res) => {
    try {
        const { auctionId } = req.params;
        const userId = req.user.id;

        const watchlist = await prisma.watchlist.findUnique({
            where: {
                userId_auctionId: {
                    userId,
                    auctionId: parseInt(auctionId)
                }
            }
        });

        if (!watchlist) {
            return res.status(404).json({ error: 'Not in watchlist' });
        }

        await prisma.watchlist.delete({
            where: {
                userId_auctionId: {
                    userId,
                    auctionId: parseInt(auctionId)
                }
            }
        });

        res.json({ message: 'Removed from watchlist' });
    } catch (error) {
        console.error('Remove from watchlist error:', error);
        res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
};

exports.getUserWatchlist = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const [watchlist, total] = await prisma.$transaction([
            prisma.watchlist.findMany({
                where: { userId },
                include: {
                    auction: {
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            images: true,
                            currentPrice: true,
                            startTime: true,
                            endTime: true,
                            status: true,
                            _count: { select: { bids: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            prisma.watchlist.count({ where: { userId } })
        ]);

        res.json({
            data: watchlist,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get watchlist error:', error);
        res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
};

exports.checkWatchlist = async (req, res) => {
    try {
        const { auctionId } = req.params;
        const userId = req.user.id;

        const watchlist = await prisma.watchlist.findUnique({
            where: {
                userId_auctionId: {
                    userId,
                    auctionId: parseInt(auctionId)
                }
            }
        });

        res.json({ isWatching: !!watchlist });
    } catch (error) {
        console.error('Check watchlist error:', error);
        res.status(500).json({ error: 'Failed to check watchlist' });
    }
};
