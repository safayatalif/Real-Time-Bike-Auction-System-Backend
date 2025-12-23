const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bidController');
const { authenticate, authorize } = require('../middlewares/auth');

// Public (or protected if sensitive) - View History
// Usually public is fine, names masked in service
router.get('/auctions/:id/bids', bidController.getAuctionBids);

// Protected - Place Bid
router.post('/bids', authenticate, authorize(['BUYER', 'SELLER']), bidController.placeBid);

module.exports = router;
