# Notification System Documentation

## Overview

The BikeBid notification system provides real-time and persistent notifications for auction-related events. Notifications are stored in the database and also pushed via Socket.IO for immediate user feedback.

## Notification Types

### 1. OUTBID
**Trigger**: When a user's bid is surpassed by another bidder
**Recipients**: Previous highest bidder
**Message**: "You have been outbid on {auction.title}. New price: ${amount}"
**Metadata**: `{ auctionId, newPrice }`

### 2. AUCTION_WON
**Trigger**: When auction ends and user has winning bid (above reserve)
**Recipients**: Winning bidder
**Message**: "You won the auction: {auction.title} for ${amount}!"
**Metadata**: `{ auctionId, finalPrice }`

### 3. AUCTION_LOST
**Trigger**: When auction ends but reserve price not met
**Recipients**: Highest bidder (when reserve not met)
**Message**: "You had the highest bid on {auction.title}, but the reserve price was not met."
**Metadata**: `{ auctionId, highestBid }`

### 4. AUCTION_SOLD
**Trigger**: When auction ends with successful sale (seller notification)
**Recipients**: Seller
**Message**: "Your auction {auction.title} ended with a winning bid of ${amount}."
**Metadata**: `{ auctionId, finalPrice, winnerId }`

### 5. AUCTION_ENDED
**Trigger**: When auction ends without bids or reserve not met (seller notification)
**Recipients**: Seller
**Message**: "Your auction {auction.title} ended with no bids." OR "...Reserve price was not met. Highest bid: ${amount}"
**Metadata**: `{ auctionId, highestBid? }`

### 6. AUCTION_ENDING_SOON
**Trigger**: 10 minutes before auction end (automated check every minute)
**Recipients**: All watchers + all bidders
**Message**: "Auction \"{auction.title}\" is ending in less than 10 minutes!"
**Metadata**: `{ auctionId, endTime }`

### 7. AUCTION_CANCELED
**Trigger**: When seller/admin cancels auction
**Recipients**: All watchers + all bidders
**Message**: "Auction {auction.title} has been canceled. Reason: {reason}"
**Metadata**: `{ auctionId, reason }`

## API Endpoints

### Get User Notifications
```http
GET /api/notifications
Authorization: Bearer {token}
Query Parameters:
  - unreadOnly: boolean (optional) - Filter to unread notifications only
  - page: number (default: 1)
  - limit: number (default: 20)

Response:
{
  "data": [
    {
      "id": 1,
      "userId": 5,
      "type": "OUTBID",
      "message": "You have been outbid on Vintage Road Bike. New price: $150",
      "isRead": false,
      "metadata": { "auctionId": 3, "newPrice": "150.00" },
      "createdAt": "2025-12-23T15:30:00Z"
    }
  ],
  "meta": {
    "total": 15,
    "unreadCount": 5,
    "page": 1,
    "limit": 20
  }
}
```

### Mark Notification as Read
```http
PATCH /api/notifications/:id/read
Authorization: Bearer {token}

Response:
{
  "id": 1,
  "userId": 5,
  "type": "OUTBID",
  "message": "...",
  "isRead": true,
  "metadata": {...},
  "createdAt": "2025-12-23T15:30:00Z"
}
```

### Mark All as Read
```http
PATCH /api/notifications/mark-all-read
Authorization: Bearer {token}

Response:
{
  "message": "All notifications marked as read",
  "count": 5
}
```

### Delete Notification
```http
DELETE /api/notifications/:id
Authorization: Bearer {token}

Response:
{
  "message": "Notification deleted"
}
```

## Watchlist Endpoints

### Add to Watchlist
```http
POST /api/watchlist
Authorization: Bearer {token}
Body: { "auctionId": 3 }

Response:
{
  "id": 1,
  "userId": 5,
  "auctionId": 3,
  "createdAt": "2025-12-23T15:30:00Z",
  "auction": {
    "id": 3,
    "title": "Vintage Road Bike",
    "currentPrice": "150.00",
    "endTime": "2025-12-24T12:00:00Z",
    "status": "LIVE"
  }
}
```

### Remove from Watchlist
```http
DELETE /api/watchlist/:auctionId
Authorization: Bearer {token}

Response:
{
  "message": "Removed from watchlist"
}
```

### Get User Watchlist
```http
GET /api/watchlist
Authorization: Bearer {token}
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 20)

Response:
{
  "data": [
    {
      "id": 1,
      "userId": 5,
      "auctionId": 3,
      "createdAt": "2025-12-23T15:30:00Z",
      "auction": {
        "id": 3,
        "title": "Vintage Road Bike",
        "description": "...",
        "images": [...],
        "currentPrice": "150.00",
        "startTime": "2025-12-23T10:00:00Z",
        "endTime": "2025-12-24T12:00:00Z",
        "status": "LIVE",
        "_count": { "bids": 5 }
      }
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 20
  }
}
```

### Check if Watching
```http
GET /api/watchlist/check/:auctionId
Authorization: Bearer {token}

Response:
{
  "isWatching": true
}
```

## Real-time Socket.IO Events

### Notification Event
When a notification is created, it's immediately pushed to the user's socket room:

```javascript
socket.on('notification', (data) => {
  // {
  //   id: 123,
  //   type: 'OUTBID',
  //   message: 'You have been outbid...',
  //   metadata: { auctionId: 3, newPrice: '150.00' },
  //   createdAt: '2025-12-23T15:30:00Z'
  // }
  
  // Show toast notification
  // Update notification badge count
  // Play sound (optional)
});
```

## Implementation Details

### Automatic Notification Creation

Notifications are automatically created in the following places:

1. **bidService.js** - When placing a bid:
   - Creates OUTBID notification for previous highest bidder

2. **auctionService.js** - When auction ends:
   - Creates AUCTION_WON for winner
   - Creates AUCTION_SOLD for seller (if sold)
   - Creates AUCTION_ENDED for seller (if no bids or reserve not met)
   - Creates AUCTION_LOST for highest bidder (if reserve not met)

3. **auctionService.js** - When Buy Now executed:
   - Creates AUCTION_WON for buyer
   - Creates AUCTION_SOLD for seller

4. **auctionScheduler.js** - Every minute:
   - Checks for auctions ending in next 10 minutes
   - Creates AUCTION_ENDING_SOON for all watchers and bidders
   - Uses metadata to prevent duplicate notifications

### Database Schema

```prisma
model Notification {
  id        Int      @id @default(autoincrement())
  message   String
  type      String   // OUTBID, AUCTION_WON, ENDING_SOON, CANCELED
  isRead    Boolean  @default(false)
  metadata  Json?    // Store related auctionId, bidId etc.
  
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
  
  createdAt DateTime @default(now())
}
```

### Service Methods

**notificationService.createNotification(userId, type, message, metadata)**
- Creates single notification
- Emits Socket.IO event to user's room
- Returns created notification

**notificationService.createBulkNotifications(notifications)**
- Creates multiple notifications efficiently
- Emits Socket.IO events for each
- Used for "ending soon" notifications

**notificationService.notifyAuctionsEndingSoon()**
- Finds auctions ending in next 10 minutes
- Collects watchers and bidders
- Creates bulk notifications
- Prevents duplicates using metadata check

## Frontend Integration Example

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const socket = io('http://localhost:5000');
  
  useEffect(() => {
    // Fetch initial notifications
    fetch('/api/notifications?unreadOnly=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setNotifications(data.data);
        setUnreadCount(data.meta.unreadCount);
      });
    
    // Join user room
    socket.emit('joinUser', userId);
    
    // Listen for new notifications
    socket.on('notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Show toast
      toast.info(notification.message);
    });
    
    return () => socket.disconnect();
  }, []);
  
  const markAsRead = (id) => {
    fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(() => {
      setUnreadCount(prev => prev - 1);
    });
  };
  
  return (
    <div className="notification-bell">
      <BellIcon />
      {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
      <NotificationDropdown 
        notifications={notifications}
        onMarkAsRead={markAsRead}
      />
    </div>
  );
}
```

## Best Practices

1. **Always join user room on login**: `socket.emit('joinUser', userId)`
2. **Fetch notifications on page load** to show initial state
3. **Update UI optimistically** when marking as read
4. **Show toast/banner** for real-time notifications
5. **Group notifications** by auction or type for better UX
6. **Allow bulk actions** (mark all as read, delete all)
7. **Implement pagination** for notification history
8. **Cache notification count** in Redux/Zustand

## Future Enhancements (Optional)

### Email Notifications
- Install Bull queue: `npm install bull`
- Create email job processor
- Send digest emails (daily/weekly)
- Allow user preferences for email frequency

### Push Notifications
- Integrate with Firebase Cloud Messaging (FCM)
- Store device tokens in database
- Send push notifications for critical events

### Notification Preferences
- Add user settings table
- Allow users to opt-in/out of specific notification types
- Respect "Do Not Disturb" hours

### Notification Grouping
- Group multiple OUTBID notifications for same auction
- Show "You've been outbid 3 times on Vintage Road Bike"

---

**Implementation Status: Complete ✅**
