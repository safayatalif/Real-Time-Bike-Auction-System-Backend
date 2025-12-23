const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getUserNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { unreadOnly, page = 1, limit = 20 } = req.query;

        const skip = (page - 1) * limit;

        const where = { userId };
        if (unreadOnly === 'true') {
            where.isRead = false;
        }

        const [notifications, total, unreadCount] = await prisma.$transaction([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({ where: { userId, isRead: false } })
        ]);

        res.json({
            data: notifications,
            meta: {
                total,
                unreadCount,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verify ownership
        const notification = await prisma.notification.findUnique({
            where: { id: parseInt(id) }
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notification.userId !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const updated = await prisma.notification.update({
            where: { id: parseInt(id) },
            data: { isRead: true }
        });

        res.json(updated);
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });

        res.json({ message: 'All notifications marked as read', count: result.count });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verify ownership
        const notification = await prisma.notification.findUnique({
            where: { id: parseInt(id) }
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notification.userId !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await prisma.notification.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
};
