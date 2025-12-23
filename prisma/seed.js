const { PrismaClient, Role, UserStatus, AuctionStatus } = require('@prisma/client');
const prisma = new PrismaClient();
// Dummy hash (for real app use bcrypt)
const DUMMY_HASH = "hashed_password_123";

async function main() {
    console.log('Seeding database...');

    // 1. Create Users
    const admin = await prisma.user.upsert({
        where: { email: 'admin@bikebid.com' },
        update: {},
        create: {
            email: 'admin@bikebid.com',
            password: DUMMY_HASH,
            name: 'Admin User',
            role: Role.ADMIN,
            status: UserStatus.ACTIVE,
        },
    });

    const seller = await prisma.user.upsert({
        where: { email: 'seller@bikebid.com' },
        update: {},
        create: {
            email: 'seller@bikebid.com',
            password: DUMMY_HASH,
            name: 'Seller User',
            role: Role.SELLER,
            status: UserStatus.ACTIVE,
        },
    });

    const buyer = await prisma.user.upsert({
        where: { email: 'buyer@bikebid.com' },
        update: {},
        create: {
            email: 'buyer@bikebid.com',
            password: DUMMY_HASH,
            name: 'Buyer User',
            role: Role.BUYER,
            status: UserStatus.ACTIVE,
        },
    });

    console.log({ admin, seller, buyer });

    // 2. Create an Auction
    const auction = await prisma.auction.create({
        data: {
            title: 'Vintage Road Bike 1980',
            description: 'A classic road bike in excellent condition.',
            startTime: new Date(),
            endTime: new Date(Date.now() + 1000 * 60 * 60 * 24), // Ends in 24 hours
            startingPrice: 100.00,
            minIncrement: 10.00,
            reservePrice: 200.00,
            sellerId: seller.id,
            status: AuctionStatus.LIVE,
        },
    });

    console.log('Created Auction:', auction);

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
