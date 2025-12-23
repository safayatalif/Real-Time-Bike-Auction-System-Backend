const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
const authRoutes = require('./routes/auth.routes');
const auctionRoutes = require('./routes/auction.routes');
const bidRoutes = require('./routes/bid.routes');
const notificationRoutes = require('./routes/notification.routes');
const watchlistRoutes = require('./routes/watchlist.routes');
const adminRoutes = require('./routes/admin.routes');

app.get('/', (req, res) => {
  res.json({ message: 'BikeBid API is running' });
});

app.use('/api/auctions', auctionRoutes);
app.use('/api', bidRoutes); // Note: bid routes are defined with /bids and /auctions/...
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
