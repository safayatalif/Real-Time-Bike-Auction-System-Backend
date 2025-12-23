const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const redis = require('../config/redis');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/token');

const prisma = new PrismaClient();

exports.register = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        // Allow role selection for demo purposes, ideally restrict ADMIN creation
        const userRole = role && ['BUYER', 'SELLER'].includes(role) ? role : 'BUYER';

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: userRole,
            },
            select: { id: true, email: true, name: true, role: true, status: true, createdAt: true }
        });

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Store refresh token in Redis (whitelist approach)
        await redis.set(`refresh_token:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

        res.status(201).json({ user, accessToken, refreshToken });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Account suspended' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await redis.set(`refresh_token:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

        // Return user without password
        const { password: _, ...userData } = user;
        res.json({ user: userData, accessToken, refreshToken });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.logout = async (req, res) => {
    try {
        const token = req.token; // From auth middleware
        const userId = req.user.id;

        // Blocklist current access token
        // Decode to get exp time for redis TTL
        const decoded = require('jsonwebtoken').decode(token);
        if (decoded) {
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await redis.set(`bl_${token}`, 'true', 'EX', ttl);
            }
        }

        // Remove refresh token
        await redis.del(`refresh_token:${userId}`);

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
};

exports.refreshToken = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh Token required' });

    try {
        const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
        const storedToken = await redis.get(`refresh_token:${decoded.id}`);

        if (!storedToken || storedToken !== refreshToken) {
            return res.status(403).json({ error: 'Invalid or expired refresh token' });
        }

        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user || user.status === 'SUSPENDED') {
            return res.status(403).json({ error: 'User unavailable or suspended' });
        }

        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Rotate refresh token
        await redis.set(`refresh_token:${user.id}`, newRefreshToken, 'EX', 7 * 24 * 60 * 60);

        res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });

    } catch (err) {
        return res.status(403).json({ error: 'Invalid refresh token' });
    }
}

exports.getMe = async (req, res) => {
    // req.user is set by authenticate middleware
    res.json({ user: req.user });
};
