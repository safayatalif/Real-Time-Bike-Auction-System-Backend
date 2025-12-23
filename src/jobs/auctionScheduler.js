const cron = require('node-cron');
const auctionService = require('../services/auctionService');

const startScheduler = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            console.log('Running auction state job...');
            await auctionService.transitionAuctions();
        } catch (error) {
            console.error('Error in auction scheduler:', error);
        }
    });
};

module.exports = startScheduler;
