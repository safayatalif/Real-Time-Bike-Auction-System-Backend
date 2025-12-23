const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auctionController');
const { authenticate, authorize } = require('../middlewares/auth');

// Public
router.get('/', auctionController.listAuctions);
router.get('/seller', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.getSellerAuctions);
router.get('/:id', auctionController.getAuction); // Optional: if viewing needs login, add auth

// Protected
router.post('/', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.createAuction);
router.put('/:id', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.updateAuction);
router.patch('/:id/cancel', authenticate, authorize(['SELLER', 'ADMIN']), auctionController.cancelAuction);
router.post('/:id/buy-now', authenticate, authorize(['BUYER']), auctionController.buyNow);

module.exports = router;
