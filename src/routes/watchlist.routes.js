const express = require('express');
const router = express.Router();
const watchlistController = require('../controllers/watchlistController');
const { authenticate } = require('../middlewares/auth');

// All watchlist routes require authentication
router.get('/', authenticate, watchlistController.getUserWatchlist);
router.post('/', authenticate, watchlistController.addToWatchlist);
router.delete('/:auctionId', authenticate, watchlistController.removeFromWatchlist);
router.get('/check/:auctionId', authenticate, watchlistController.checkWatchlist);

module.exports = router;
