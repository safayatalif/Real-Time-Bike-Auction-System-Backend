const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

beforeAll(async () => {
    // Connect to DB
    await prisma.$connect();
});

afterAll(async () => {
    // Disconnect
    await prisma.$disconnect();
});

module.exports = prisma;
