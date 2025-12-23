const bidService = require('../services/bidService');
const auctionService = require('../services/auctionService');

exports.placeBid = async (req, res) => {
    try {
        const { auctionId, amount, idempotencyKey } = req.body;
        const userId = req.user.id;

        if (!auctionId || !amount) {
            return res.status(400).json({ error: "Auction ID and Amount are required" });
        }

        const result = await bidService.placeBid(userId, auctionId, amount, idempotencyKey, req);

        // Emit Socket Event
        // Emit Socket Event
        const { getIO } = require('../config/socket');
        const io = getIO();

        if (io) {
            // Broadcast to Auction Room
            io.to(`auction:${result.auction.id}`).emit('bidPlaced', {
                auctionId: result.auction.id,
                newPrice: result.auction.currentPrice,
                bidderName: req.user.name || 'Anonymous', // Masking could be handled better
                bidCount: result.auction._count.bids,
                endTime: result.auction.endTime
            });

            if (result.extended) {
                io.to(`auction:${result.auction.id}`).emit('auctionExtended', {
                    auctionId: result.auction.id,
                    newEndTime: result.auction.endTime
                });
            }

            // Private notification to outbid user
            if (result.previousBidderId && result.previousBidderId !== userId) {
                io.to(`user:${result.previousBidderId}`).emit('outbid', {
                    auctionId: result.auction.id,
                    newPrice: result.auction.currentPrice
                });
            }
        }

        // Invalidate Cache
        await auctionService.invalidateAuctionCache(result.auction.id);

        res.status(201).json(result);

    } catch (error) {
        console.error('Place Bid Error:', error.message);
        // Distinguish expected validation errors vs server errors
        if (error.message.includes('not LIVE') || error.message.includes('too low') || error.message.includes('closed')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to place bid" });
    }
};

exports.getAuctionBids = async (req, res) => {
    try {
        const { id } = req.params;
        const bids = await bidService.getBidHistory(id);
        res.json(bids);
    } catch (error) {
        console.error('Get Bids Error:', error);
        res.status(500).json({ error: "Failed to fetch bids" });
    }
};
