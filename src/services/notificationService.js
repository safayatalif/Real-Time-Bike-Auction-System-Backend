const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Create a notification for a user
 */
exports.createNotification = async (userId, type, message, metadata = {}) => {
    try {
        const notification = await prisma.notification.create({
            data: {
                userId,
                type,
                message,
                metadata,
                isRead: false
            }
        });

        // Emit Socket.IO event for real-time notification
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            if (io) {
                io.to(`user:${userId}`).emit('notification', {
                    id: notification.id,
                    type: notification.type,
                    message: notification.message,
                    metadata: notification.metadata,
                    createdAt: notification.createdAt
                });
            }
        } catch (socketError) {
            // Socket might not be initialized, continue without real-time
            console.log('Socket.IO not available for notification');
        }

        return notification;
    } catch (error) {
        console.error('Create notification error:', error);
        throw error;
    }
};

/**
 * Create notifications for multiple users
 */
exports.createBulkNotifications = async (notifications) => {
    try {
        const created = await prisma.notification.createMany({
            data: notifications.map(n => ({
                userId: n.userId,
                type: n.type,
                message: n.message,
                metadata: n.metadata || {},
                isRead: false
            }))
        });

        // Emit Socket.IO events
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            if (io) {
                notifications.forEach(n => {
                    io.to(`user:${n.userId}`).emit('notification', {
                        type: n.type,
                        message: n.message,
                        metadata: n.metadata
                    });
                });
            }
        } catch (socketError) {
            console.log('Socket.IO not available for bulk notifications');
        }

        return created;
    } catch (error) {
        console.error('Create bulk notifications error:', error);
        throw error;
    }
};

/**
 * Check for auctions ending soon and notify watchers
 */
exports.notifyAuctionsEndingSoon = async () => {
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    // Find auctions ending in the next 10 minutes that haven't been notified
    const endingSoonAuctions = await prisma.auction.findMany({
        where: {
            status: 'LIVE',
            endTime: {
                gte: now,
                lte: tenMinutesFromNow
            }
        },
        include: {
            watchlist: {
                include: {
                    user: true
                }
            },
            bids: {
                where: { status: 'ACCEPTED' },
                distinct: ['bidderId'],
                select: { bidderId: true }
            }
        }
    });

    for (const auction of endingSoonAuctions) {
        // Check if we already sent "ending soon" notification
        // We'll use metadata to track this
        const existingNotification = await prisma.notification.findFirst({
            where: {
                metadata: {
                    path: ['auctionId'],
                    equals: auction.id
                },
                type: 'AUCTION_ENDING_SOON'
            }
        });

        if (existingNotification) continue; // Already notified

        // Collect unique user IDs (watchers + bidders)
        const userIds = new Set();

        // Add watchers
        auction.watchlist.forEach(w => userIds.add(w.userId));

        // Add bidders
        auction.bids.forEach(b => userIds.add(b.bidderId));

        // Create notifications
        const notifications = Array.from(userIds).map(userId => ({
            userId,
            type: 'AUCTION_ENDING_SOON',
            message: `Auction "${auction.title}" is ending in less than 10 minutes!`,
            metadata: { auctionId: auction.id, endTime: auction.endTime }
        }));

        if (notifications.length > 0) {
            await exports.createBulkNotifications(notifications);
            console.log(`Notified ${notifications.length} users about auction ${auction.id} ending soon`);
        }
    }
};
