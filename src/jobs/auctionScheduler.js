const cron = require('node-cron');
const auctionService = require('../services/auctionService');
const notificationService = require('../services/notificationService');

const startScheduler = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            console.log('Running auction state job...');
            await auctionService.transitionAuctions();

            // Check for auctions ending soon
            await notificationService.notifyAuctionsEndingSoon();
        } catch (error) {
            console.error('Error in auction scheduler:', error);
        }
    });
};

module.exports = startScheduler;
