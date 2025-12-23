const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split(' ')[1];

        // Check if token is blocklisted
        const isBlocklisted = await redis.get(`bl_${token}`);
        if (isBlocklisted) {
            return res.status(401).json({ error: 'Unauthorized: Token revoked' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'access_secret');

        // Fetch fresh user data to ensure latest status/role
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, role: true, status: true }
        });

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (user.status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Account suspended' });
        }

        req.user = user;
        req.token = token; // Useful for logout
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        }

        next();
    };
};

module.exports = { authenticate, authorize };
