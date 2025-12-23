# Admin Features Documentation

## Overview

The BikeBid admin panel provides comprehensive tools for platform moderation, user management, and system monitoring. All admin endpoints require ADMIN role authentication.

## Authentication

All admin routes require:
1. Valid JWT token in Authorization header
2. User role must be `ADMIN`

```http
Authorization: Bearer {admin_access_token}
```

## API Endpoints

### Dashboard Statistics

Get overview statistics for the platform.

```http
GET /api/admin/dashboard
Authorization: Bearer {token}

Response:
{
  "users": {
    "total": 150,
    "active": 145,
    "suspended": 5
  },
  "auctions": {
    "total": 320,
    "live": 45,
    "ended": 250
  },
  "bids": {
    "total": 1250
  },
  "recentAuctions": [
    {
      "id": 1,
      "title": "Vintage Road Bike",
      "status": "LIVE",
      "currentPrice": "250.00",
      "seller": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "_count": {
        "bids": 15
      }
    }
  ]
}
```

---

## User Management

### Get All Users

List all users with filtering and pagination.

```http
GET /api/admin/users
Authorization: Bearer {token}
Query Parameters:
  - role: string (BUYER, SELLER, ADMIN) - Filter by role
  - status: string (ACTIVE, SUSPENDED) - Filter by status
  - search: string - Search by name or email
  - page: number (default: 1)
  - limit: number (default: 20)

Response:
{
  "data": [
    {
      "id": 5,
      "email": "user@example.com",
      "name": "John Doe",
      "role": "BUYER",
      "status": "ACTIVE",
      "createdAt": "2025-12-20T10:00:00Z",
      "updatedAt": "2025-12-23T15:30:00Z",
      "_count": {
        "auctions": 3,
        "bids": 25
      }
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20
  }
}
```

### Suspend User

Suspend a user account (prevents login and all actions).

```http
PATCH /api/admin/users/:id/suspend
Authorization: Bearer {token}
Body: {
  "reason": "Violation of terms of service"
}

Response:
{
  "message": "User suspended",
  "user": {
    "id": 5,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "BUYER",
    "status": "SUSPENDED"
  }
}
```

**Effects of Suspension:**
- User cannot log in (existing tokens remain valid until expiry)
- User cannot place bids
- User cannot create auctions
- Middleware blocks all authenticated actions

**Audit Log Created:**
- Action: `USER_SUSPENDED`
- Entity: `USER`
- Details: `{ targetUser, reason }`

### Unsuspend User

Restore a suspended user account.

```http
PATCH /api/admin/users/:id/unsuspend
Authorization: Bearer {token}

Response:
{
  "message": "User unsuspended",
  "user": {
    "id": 5,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "BUYER",
    "status": "ACTIVE"
  }
}
```

**Audit Log Created:**
- Action: `USER_UNSUSPENDED`
- Entity: `USER`

---

## Auction Moderation

### Get All Auctions

List all auctions with filtering (admin view includes all fields).

```http
GET /api/admin/auctions
Authorization: Bearer {token}
Query Parameters:
  - status: string (DRAFT, SCHEDULED, LIVE, ENDED, CANCELED)
  - sellerId: number - Filter by seller
  - search: string - Search by title or description
  - page: number (default: 1)
  - limit: number (default: 20)

Response:
{
  "data": [
    {
      "id": 1,
      "title": "Vintage Road Bike",
      "description": "...",
      "images": [...],
      "startTime": "2025-12-23T10:00:00Z",
      "endTime": "2025-12-24T10:00:00Z",
      "startingPrice": "100.00",
      "currentPrice": "250.00",
      "reservePrice": "200.00",  // Admin can see reserve price
      "buyNowPrice": "500.00",
      "status": "LIVE",
      "seller": {
        "id": 3,
        "name": "Seller Name",
        "email": "seller@example.com"
      },
      "winner": null,
      "_count": {
        "bids": 15
      },
      "createdAt": "2025-12-20T10:00:00Z",
      "updatedAt": "2025-12-23T15:30:00Z"
    }
  ],
  "meta": {
    "total": 320,
    "page": 1,
    "limit": 20
  }
}
```

### Cancel Auction (Admin)

Cancel any auction with a reason (notifies all interested parties).

```http
PATCH /api/admin/auctions/:id/cancel
Authorization: Bearer {token}
Body: {
  "reason": "Violates platform policies - fraudulent listing"
}

Response:
{
  "message": "Auction canceled",
  "auction": {
    "id": 1,
    "title": "Vintage Road Bike",
    "status": "CANCELED",
    ...
  }
}
```

**Effects of Cancellation:**
- Auction status set to `CANCELED`
- No further bids accepted
- Notifications sent to:
  - Seller
  - All bidders
  - All watchers
- Notification message includes admin reason

**Audit Log Created:**
- Action: `AUCTION_CANCELED_BY_ADMIN`
- Entity: `AUCTION`
- Details: `{ title, reason }`

---

## Audit Logs

### Get Audit Logs

View complete audit trail with filtering.

```http
GET /api/admin/audit-logs
Authorization: Bearer {token}
Query Parameters:
  - userId: number - Filter by user who performed action
  - auctionId: number - Filter by auction
  - action: string - Filter by action type
  - entity: string (USER, AUCTION, BID) - Filter by entity type
  - page: number (default: 1)
  - limit: number (default: 50)

Response:
{
  "data": [
    {
      "id": 123,
      "action": "BID_PLACED",
      "entity": "BID",
      "entityId": 456,
      "userId": 5,
      "auctionId": 1,
      "details": {
        "amount": "250.00",
        "status": "ACCEPTED",
        "extended": false
      },
      "user": {
        "id": 5,
        "name": "John Doe",
        "email": "john@example.com",
        "role": "BUYER"
      },
      "auction": {
        "id": 1,
        "title": "Vintage Road Bike",
        "status": "LIVE"
      },
      "createdAt": "2025-12-23T15:30:00Z"
    }
  ],
  "meta": {
    "total": 5000,
    "page": 1,
    "limit": 50
  }
}
```

### Audit Log Action Types

**User Actions:**
- `USER_SUSPENDED` - Admin suspended user
- `USER_UNSUSPENDED` - Admin unsuspended user

**Auction Actions:**
- `AUCTION_CREATED` - Seller created auction
- `AUCTION_CANCELED` - Seller canceled auction
- `AUCTION_CANCELED_BY_ADMIN` - Admin canceled auction
- `AUCTION_ENDED` - Auction closed automatically

**Bid Actions:**
- `BID_PLACED` - User placed bid
- `BID_REJECTED` - Bid rejected (with reason in details)

**Buy Now Actions:**
- `BUY_NOW` - User purchased via Buy Now

---

## Security & Permissions

### Role-Based Access Control

```javascript
// Middleware stack for admin routes
const adminOnly = [authenticate, authorize(['ADMIN'])];

// Applied to all admin routes
router.get('/users', adminOnly, adminController.getUsers);
```

### Protection Against Admin Abuse

1. **Cannot suspend other admins**: Attempting to suspend an admin user returns 403 error
2. **All actions logged**: Every admin action creates an audit log entry
3. **Immutable audit logs**: Audit logs cannot be deleted or modified
4. **User context tracked**: Every audit log includes the admin's userId

### Error Handling

**401 Unauthorized:**
```json
{
  "error": "Unauthorized: No token provided"
}
```

**403 Forbidden:**
```json
{
  "error": "Forbidden: Insufficient permissions"
}
```

**404 Not Found:**
```json
{
  "error": "User not found"
}
```

**400 Bad Request:**
```json
{
  "error": "Cannot suspend admin users"
}
```

---

## Frontend Integration Example

### Admin Dashboard Component

```javascript
import { useEffect, useState } from 'react';

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [auctions, setAuctions] = useState([]);
  
  useEffect(() => {
    // Fetch dashboard stats
    fetch('/api/admin/dashboard', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })
      .then(res => res.json())
      .then(data => setStats(data));
    
    // Fetch users
    fetch('/api/admin/users?page=1&limit=10', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })
      .then(res => res.json())
      .then(data => setUsers(data.data));
  }, []);
  
  const suspendUser = async (userId, reason) => {
    const confirmed = window.confirm('Are you sure you want to suspend this user?');
    if (!confirmed) return;
    
    await fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    
    // Refresh users list
    // ...
  };
  
  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="stats-grid">
        <StatCard title="Total Users" value={stats?.users.total} />
        <StatCard title="Active Users" value={stats?.users.active} />
        <StatCard title="Live Auctions" value={stats?.auctions.live} />
        <StatCard title="Total Bids" value={stats?.bids.total} />
      </div>
      
      {/* Users Table */}
      <UsersTable 
        users={users}
        onSuspend={suspendUser}
      />
      
      {/* Auctions Table */}
      <AuctionsTable auctions={auctions} />
    </div>
  );
}
```

### Audit Log Viewer

```javascript
function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    action: '',
    userId: '',
    auctionId: ''
  });
  
  const fetchLogs = () => {
    const params = new URLSearchParams(filters);
    fetch(`/api/admin/audit-logs?${params}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })
      .then(res => res.json())
      .then(data => setLogs(data.data));
  };
  
  return (
    <div className="audit-log-viewer">
      <h2>Audit Logs</h2>
      
      {/* Filters */}
      <div className="filters">
        <select onChange={e => setFilters({...filters, action: e.target.value})}>
          <option value="">All Actions</option>
          <option value="BID_PLACED">Bid Placed</option>
          <option value="USER_SUSPENDED">User Suspended</option>
          <option value="AUCTION_CANCELED_BY_ADMIN">Auction Canceled</option>
        </select>
        
        <button onClick={fetchLogs}>Apply Filters</button>
      </div>
      
      {/* Logs Table */}
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>User</th>
            <th>Entity</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.action}</td>
              <td>{log.user?.name || 'System'}</td>
              <td>{log.entity} #{log.entityId}</td>
              <td>{JSON.stringify(log.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Best Practices

### 1. Confirmation Dialogs
Always show confirmation before destructive actions (suspend, cancel).

### 2. Reason Fields
Require admins to provide reasons for moderation actions.

### 3. Audit Trail Review
Regularly review audit logs for suspicious activity.

### 4. Role Segregation
Use separate admin accounts, don't use admin role for regular bidding.

### 5. Notification Transparency
When canceling auctions, provide clear reasons to affected users.

### 6. Data Export
Consider adding CSV/Excel export for users, auctions, and audit logs.

---

## Future Enhancements

### 1. Advanced Analytics
- Revenue tracking
- User engagement metrics
- Auction success rates
- Fraud detection patterns

### 2. Bulk Actions
- Bulk user suspension
- Bulk auction cancellation
- Bulk notification sending

### 3. Admin Roles
- Super Admin vs Moderator
- Granular permissions
- Action approval workflows

### 4. Reporting Tools
- Scheduled reports
- Email alerts for suspicious activity
- Automated fraud detection

### 5. Content Moderation
- Image approval queue
- Automated profanity detection
- User-reported content review

---

**Implementation Status: Complete ✅**

All admin features are fully implemented and ready for production use.
