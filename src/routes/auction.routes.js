const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auctionController');
const { authenticate, authorize } = require('../middlewares/auth');

// Public
router.get('/', auctionController.listAuctions);
router.get('/seller', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.getSellerAuctions);
router.get('/my-bids', authenticate, auctionController.getUserBids);
router.get('/:id', auctionController.getAuction);

// Protected
router.post('/', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.createAuction);
router.patch('/:id', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.updateAuction);
router.patch('/:id/cancel', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.cancelAuction);
router.post('/:id/buy-now', authenticate, authorize(['BUYER']), auctionController.buyNow);

module.exports = router;
