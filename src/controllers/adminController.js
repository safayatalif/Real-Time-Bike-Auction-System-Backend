const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// User Management
exports.getUsers = async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const where = {};
        if (role) where.role = role;
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            auctions: true,
                            bids: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            prisma.user.count({ where })
        ]);

        res.json({
            data: users,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.suspendUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role === 'ADMIN') {
            return res.status(403).json({ error: 'Cannot suspend admin users' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { status: 'SUSPENDED' },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'USER_SUSPENDED',
                entity: 'USER',
                entityId: parseInt(id),
                userId: adminId,
                details: {
                    targetUser: user.email,
                    reason: reason || 'No reason provided'
                }
            }
        });

        res.json({ message: 'User suspended', user: updatedUser });
    } catch (error) {
        console.error('Suspend user error:', error);
        res.status(500).json({ error: 'Failed to suspend user' });
    }
};

exports.unsuspendUser = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { status: 'ACTIVE' },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'USER_UNSUSPENDED',
                entity: 'USER',
                entityId: parseInt(id),
                userId: adminId,
                details: { targetUser: user.email }
            }
        });

        res.json({ message: 'User unsuspended', user: updatedUser });
    } catch (error) {
        console.error('Unsuspend user error:', error);
        res.status(500).json({ error: 'Failed to unsuspend user' });
    }
};

// Auction Moderation
exports.getAuctions = async (req, res) => {
    try {
        const { status, sellerId, search, page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const where = {};
        if (status) where.status = status;
        if (sellerId) where.sellerId = parseInt(sellerId);
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [auctions, total] = await prisma.$transaction([
            prisma.auction.findMany({
                where,
                include: {
                    seller: {
                        select: { id: true, name: true, email: true }
                    },
                    winner: {
                        select: { id: true, name: true, email: true }
                    },
                    _count: {
                        select: { bids: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            prisma.auction.count({ where })
        ]);

        res.json({
            data: auctions,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get auctions error:', error);
        res.status(500).json({ error: 'Failed to fetch auctions' });
    }
};

exports.cancelAuction = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        const auction = await prisma.auction.findUnique({
            where: { id: parseInt(id) },
            include: {
                seller: true,
                bids: {
                    where: { status: 'ACCEPTED' },
                    distinct: ['bidderId'],
                    select: { bidderId: true }
                },
                watchlist: {
                    select: { userId: true }
                }
            }
        });

        if (!auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }

        if (auction.status === 'ENDED' || auction.status === 'CANCELED') {
            return res.status(400).json({ error: 'Auction is already closed' });
        }

        const updatedAuction = await prisma.auction.update({
            where: { id: parseInt(id) },
            data: { status: 'CANCELED' }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'AUCTION_CANCELED_BY_ADMIN',
                entity: 'AUCTION',
                entityId: parseInt(id),
                userId: adminId,
                auctionId: parseInt(id),
                details: {
                    title: auction.title,
                    reason: reason || 'Admin moderation'
                }
            }
        });

        // Notify all interested parties
        const notificationService = require('../services/notificationService');
        const userIds = new Set();

        // Add seller
        userIds.add(auction.sellerId);

        // Add bidders
        auction.bids.forEach(b => userIds.add(b.bidderId));

        // Add watchers
        auction.watchlist.forEach(w => userIds.add(w.userId));

        const notifications = Array.from(userIds).map(userId => ({
            userId,
            type: 'AUCTION_CANCELED',
            message: `Auction "${auction.title}" has been canceled by admin. Reason: ${reason || 'Policy violation'}`,
            metadata: { auctionId: auction.id, reason }
        }));

        if (notifications.length > 0) {
            await notificationService.createBulkNotifications(notifications);
        }

        res.json({ message: 'Auction canceled', auction: updatedAuction });
    } catch (error) {
        console.error('Cancel auction error:', error);
        res.status(500).json({ error: 'Failed to cancel auction' });
    }
};

// Audit Logs
exports.getAuditLogs = async (req, res) => {
    try {
        const { userId, auctionId, action, entity, page = 1, limit = 50 } = req.query;
        const skip = (page - 1) * limit;

        const where = {};
        if (userId) where.userId = parseInt(userId);
        if (auctionId) where.auctionId = parseInt(auctionId);
        if (action) where.action = action;
        if (entity) where.entity = entity;

        const [logs, total] = await prisma.$transaction([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, name: true, email: true, role: true }
                    },
                    auction: {
                        select: { id: true, title: true, status: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            prisma.auditLog.count({ where })
        ]);

        res.json({
            data: logs,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
};

// Dashboard Stats
exports.getDashboardStats = async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            suspendedUsers,
            totalAuctions,
            liveAuctions,
            endedAuctions,
            totalBids,
            recentAuctions
        ] = await prisma.$transaction([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.user.count({ where: { status: 'SUSPENDED' } }),
            prisma.auction.count(),
            prisma.auction.count({ where: { status: 'LIVE' } }),
            prisma.auction.count({ where: { status: 'ENDED' } }),
            prisma.bid.count({ where: { status: 'ACCEPTED' } }),
            prisma.auction.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    seller: { select: { name: true, email: true } },
                    _count: { select: { bids: true } }
                }
            })
        ]);

        res.json({
            users: {
                total: totalUsers,
                active: activeUsers,
                suspended: suspendedUsers
            },
            auctions: {
                total: totalAuctions,
                live: liveAuctions,
                ended: endedAuctions
            },
            bids: {
                total: totalBids
            },
            recentAuctions
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
};
