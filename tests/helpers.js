const request = require('supertest');
const app = require('../src/app');

const registerUser = async (name, email, password, role = 'BUYER') => {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name, email, password, role });
    return res.body; // { user, accessToken }
};

const createAuction = async (token, title = 'Test Bike', price = 100) => {
    const future = new Date();
    future.setMinutes(future.getMinutes() + 10);

    const res = await request(app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${token}`)
        .send({
            title,
            description: 'Test Description',
            startingPrice: price,
            minIncrement: 10,
            startTime: new Date().toISOString(),
            endTime: future.toISOString(),
            status: 'LIVE' // The controller logic might force scheduled, but if time is now, it becomes LIVE
        });
    return res.body;
};

module.exports = { registerUser, createAuction };
