# BikeBid - Real-Time Bike Auction System (Backend)

A production-ready backend API for a real-time bike auction platform with WebSocket support, anti-sniping, and concurrency-safe bidding.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control (BUYER, SELLER, ADMIN)
- **Real-time Bidding**: Socket.IO for live auction updates
- **Anti-Sniping**: Automatic auction time extension when bids arrive near closing time
- **Buy Now**: Instant purchase option with atomic transaction handling
- **Concurrency Safety**: Database row locking to prevent race conditions
- **Idempotent Bids**: Client-supplied idempotency keys prevent duplicate bids
- **Redis Caching**: Auction metadata caching and token management
- **Audit Logging**: Complete action history for compliance
- **Notifications**: In-app notifications for outbid, auction won/lost, etc.
- **Automated Jobs**: Cron-based auction state transitions (SCHEDULED → LIVE → ENDED)

## 📋 Prerequisites

- Node.js (v16+)
- PostgreSQL database (Neon recommended)
- Redis instance (Upstash recommended)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone https://github.com/safayatalif/Real-Time-Bike-Auction-System-Backend.git
cd Real-Time-Bike-Auction-System-Backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Configuration**

Create a `.env` file in the root directory:

```env
# Server
PORT=5000

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@ep-xxx.aws.neon.tech/bikebid?sslmode=require"

# Redis (Upstash)
REDIS_URL="redis://default:password@your-upstash-instance:6379"

# JWT Secrets
JWT_SECRET="your_strong_access_token_secret_here"
JWT_REFRESH_SECRET="your_strong_refresh_token_secret_here"
```

4. **Database Setup**

Run Prisma migrations:
```bash
npx prisma migrate dev --name init
```

5. **Seed Database** (Optional)

Populate with sample data:
```bash
npx prisma db seed
```

This creates:
- Admin: `admin@bikebid.com`
- Seller: `seller@bikebid.com`
- Buyer: `buyer@bikebid.com`
- Password for all: `hashed_password_123` (update in seed.js for real passwords)

## 🏃 Running the Server

**Development Mode** (with auto-reload):
```bash
npm run dev
```

**Production Mode**:
```bash
npm start
```

The server will start on `http://localhost:5000`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout (requires auth)
- `GET /api/auth/me` - Get current user (requires auth)

### Auctions
- `GET /api/auctions` - List auctions (public, with filters)
- `GET /api/auctions/:id` - Get auction details (public)
- `POST /api/auctions` - Create auction (SELLER/ADMIN only)
- `PUT /api/auctions/:id` - Update auction (SELLER/ADMIN, DRAFT only)
- `PATCH /api/auctions/:id/cancel` - Cancel auction (SELLER/ADMIN)
- `POST /api/auctions/:id/buy-now` - Instant purchase (BUYER only)

### Bidding
- `POST /api/bids` - Place a bid (BUYER/SELLER, requires auth)
- `GET /api/auctions/:id/bids` - Get bid history (public)

## 🔌 WebSocket Events

### Client → Server
```javascript
socket.emit('joinAuction', auctionId);  // Join auction room
socket.emit('joinUser', userId);         // Join user room (for notifications)
socket.emit('leaveAuction', auctionId);  // Leave auction room
```

### Server → Client
```javascript
// Bid placed in auction
socket.on('bidPlaced', (data) => {
  // { auctionId, newPrice, bidderName, bidCount, endTime }
});

// Auction time extended (anti-sniping)
socket.on('auctionExtended', (data) => {
  // { auctionId, newEndTime }
});

// Auction ended
socket.on('auctionEnded', (data) => {
  // { auctionId, winnerId, finalPrice, reason }
});

// User outbid (private notification)
socket.on('outbid', (data) => {
  // { auctionId, newPrice }
});

// New auction went live
socket.on('auctionLive', (data) => {
  // { auctionId, startTime, endTime, startingPrice }
});
```

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache/PubSub**: Redis (with ioredis)
- **Real-time**: Socket.IO (with Redis adapter for scaling)
- **Scheduler**: node-cron
- **Auth**: JWT (jsonwebtoken + bcryptjs)

### Key Design Decisions

1. **Concurrency Control**: Uses PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) inside transactions to prevent race conditions during bidding.

2. **Idempotency**: Client-supplied `idempotencyKey` ensures retried requests don't create duplicate bids.

3. **Anti-Sniping**: If a bid arrives within the last 2 minutes, the auction automatically extends by 2 minutes.

4. **Redis Adapter**: Socket.IO uses Redis adapter to enable horizontal scaling across multiple server instances.

5. **Caching Strategy**: Auction metadata cached in Redis (5-min TTL) to reduce database load.

## 📂 Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.js            # Seed data script
├── src/
│   ├── config/
│   │   ├── redis.js       # Redis connection
│   │   └── socket.js      # Socket.IO setup
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── auctionController.js
│   │   └── bidController.js
│   ├── middlewares/
│   │   └── auth.js        # JWT auth & role middleware
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── auction.routes.js
│   │   └── bid.routes.js
│   ├── services/
│   │   ├── auctionService.js  # Business logic
│   │   └── bidService.js      # Bid validation & placement
│   ├── jobs/
│   │   └── auctionScheduler.js  # Cron job for state transitions
│   ├── utils/
│   │   └── token.js       # JWT helpers
│   ├── app.js             # Express app setup
│   └── server.js          # Server entry point
├── .env
├── package.json
└── README.md
```

## 🔐 Security Features

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with short expiry (15 min access, 7 day refresh)
- Token revocation via Redis blocklist
- Suspended users blocked at middleware level
- Role-based access control (RBAC)
- CORS and Helmet security headers

## 🧪 Testing

### Manual Testing with cURL

**Register**:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User","role":"BUYER"}'
```

**Login**:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Place Bid** (replace TOKEN):
```bash
curl -X POST http://localhost:5000/api/bids \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"auctionId":1,"amount":"150.00","idempotencyKey":"unique-key-123"}'
```

## 📊 Database Schema

Key models:
- **User**: Authentication, roles (BUYER/SELLER/ADMIN), status (ACTIVE/SUSPENDED)
- **Auction**: Bike listings with pricing, timing, reserve/buyNow options
- **Bid**: Bid history with idempotency and status tracking
- **Notification**: In-app notifications for users
- **Watchlist**: User-auction favorites
- **AuditLog**: Complete action history

See `prisma/schema.prisma` for full schema.

## 🚦 Auction Lifecycle

1. **DRAFT**: Seller creates auction (editable)
2. **SCHEDULED**: Auction scheduled for future start
3. **LIVE**: Auction active, accepting bids
4. **ENDED**: Auction closed, winner determined
5. **CANCELED**: Auction canceled by seller/admin

Automated transitions run every minute via cron job.

## 🔄 Scaling Considerations

- **Horizontal Scaling**: Redis adapter allows multiple Node instances
- **Database**: Connection pooling via Prisma
- **Caching**: Redis reduces DB queries for hot auctions
- **Job Distribution**: Consider Bull/BullMQ for distributed job processing in production

## 🐛 Troubleshooting

**Socket.IO not connecting?**
- Check CORS settings in `src/config/socket.js`
- Verify Redis connection

**Bids rejected?**
- Check auction status is LIVE
- Verify bid amount meets minimum increment
- Ensure user is not the seller

**Scheduler not running?**
- Check server logs for "Running auction state job..."
- Verify cron expression in `src/jobs/auctionScheduler.js`

## 📝 License

MIT

## 👥 Contributors

- Safayat Hossen Alif (@safayatalif)

## 🔗 Related Repositories

- Frontend: [https://github.com/safayatalif/Real-Time-Bike-Auction-System-Frontend]

---

**Built with ❤️ for BikeBid**
