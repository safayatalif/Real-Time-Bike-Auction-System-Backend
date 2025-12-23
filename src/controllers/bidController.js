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
        const io = req.app.get('io');
        if (io) {
            io.emit('bidUpdate', {
                auctionId: result.auction.id,
                currentPrice: result.auction.currentPrice,
                endTime: result.auction.endTime,
                bidCount: result.auction._count.bids,
                lastBid: result.bid
            });

            if (result.extended) {
                // Should also be covered by bidUpdate, but explicit event helps UI
                io.emit('auctionExtended', {
                    auctionId: result.auction.id,
                    newEndTime: result.auction.endTime
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
