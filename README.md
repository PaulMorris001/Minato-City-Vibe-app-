# NightVibe 🌃

A comprehensive event management and social networking mobile application built with React Native (Expo) and Node.js.

## Features

- 🎉 **Event Management**: Create, manage, invite to, and join events (with pending-invite tracking)
- 🎟️ **Event Passes & Check-In**: A single QR entry pass is issued for every RSVP and ticket purchase, scanned at the door to mark attendance
- 💬 **Real-time Chat**: Direct & group messaging with Socket.IO — replies, reactions, edits, @mentions, tappable links, and copy-to-clipboard
- 🎭 **Vendor Discovery**: Find and connect with event vendors
- 👥 **Social Networking**: Connect with friends and event attendees
- 📍 **Location-based**: Discover events and vendors by city
- 🔐 **Secure Authentication**: JWT-based authentication with bcrypt

## Tech Stack

### Mobile App

- React Native with Expo
- TypeScript
- Socket.IO Client for real-time features
- Expo Router for navigation
- Expo Secure Store for token management

### Backend

- Node.js with Express
- MongoDB with Mongoose
- Socket.IO for real-time communication
- JWT authentication
- Centralized environment configuration

## Project Structure

```
NightVibe/
├── mobile/                 # React Native mobile app
│   ├── app/               # Expo Router pages
│   ├── components/        # Reusable components
│   ├── services/          # API and Socket services
│   ├── constants/         # App constants and config
│   ├── libs/              # Utility libraries
│   └── utils/             # Helper functions
├── server/                # Node.js backend
│   └── src/
│       ├── config/        # Centralized configuration
│       ├── controllers/   # Route controllers
│       ├── models/        # Mongoose models
│       ├── routes/        # API routes
│       ├── services/      # Business logic
│       ├── middleware/    # Express middleware
│       └── utils/         # Utility functions
└── docs/                  # Documentation
```

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- MongoDB Atlas account (or local MongoDB)
- Expo Go app on your phone (for testing)

### Backend Setup

1. **Navigate to server directory**

   ```bash
   cd server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and update:

   - `MONGO_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A strong random secret (generate with `openssl rand -base64 32`)
   - Other variables as needed

4. **Start the server**

   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm start
   ```

5. **Verify server is running**

   ```bash
   curl http://localhost:3000/health
   # Should return: {"status":"ok","timestamp":"...","environment":"development"}
   ```

### Mobile App Setup

1. **Navigate to mobile directory**

   ```bash
   cd mobile
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure backend URL (optional for local development)**

   ```bash
   cp .env.example .env
   ```

   For local development, the app auto-detects your local IP.
   For production, set `EXPO_PUBLIC_API_URL` in `.env`

4. **Start the development server**

   ```bash
   npm start
   ```

5. **Run on your device**
   - Install Expo Go app on your phone
   - Scan the QR code shown in terminal
   - Ensure phone and computer are on the same network

## Environment Variables

### Backend (`server/.env`)

| Variable         | Required | Default       | Description               |
| ---------------- | -------- | ------------- | ------------------------- |
| `PORT`           | No       | `3000`        | Server port               |
| `HOST`           | No       | `0.0.0.0`     | Server host               |
| `NODE_ENV`       | No       | `development` | Environment mode          |
| `MONGO_URI`      | **Yes**  | -             | MongoDB connection string |
| `JWT_SECRET`     | **Yes**  | -             | Secret for JWT tokens     |
| `JWT_EXPIRES_IN` | No       | `7d`          | Token expiration time     |
| `CORS_ORIGIN`    | No       | `*`           | Allowed CORS origins      |

### Mobile (`mobile/.env`)

| Variable               | Required | Description                            |
| ---------------------- | -------- | -------------------------------------- |
| `EXPO_PUBLIC_API_URL`  | No\*     | Backend API URL (auto-detected in dev) |
| `EXPO_PUBLIC_API_PORT` | No       | Backend port (default: 3000)           |

\*Required for production builds

## API Endpoints

### Authentication

- `POST /api/register` - Register new user
- `POST /api/login` - Login user
- `GET /api/profile` - Get user profile (protected)
- `POST /api/become-vendor` - Upgrade to vendor account

### Events

- `POST /api/events` - Create event
- `GET /api/events` - Get user events
- `GET /api/events/:eventId` - Get event by ID
- `PUT /api/events/:eventId` - Update event
- `DELETE /api/events/:eventId` - Delete event
- `POST /api/events/:eventId/invite` - Invite user to event (adds to pending invites)
- `POST /api/events/:eventId/respond-invite` - Accept/decline a pending invite
- `POST /api/events/:eventId/rsvp` - RSVP going / not going
- `POST /api/events/:eventId/join` - Join a free public event

### Event Passes & Tickets

Event entry is unified under the **pass** system: RSVPs and paid tickets both
issue a QR pass (see `attendance.model.js`). Paid events charge via Stripe and
the confirmed purchase issues the same kind of pass.

- `POST /api/stripe/payment-intent/ticket/:eventId` - Start a ticket purchase (paid events)
- `POST /api/stripe/confirm/ticket/:eventId` - Confirm purchase → issues a QR pass
- `GET /api/my-passes` - Get the user's QR entry passes (RSVP + ticket)
- `POST /api/events/:eventId/check-in` - Scan a pass to check an attendee in (organizer)

### Chats

- `GET /api/chats` - Get user chats
- `POST /api/chats/direct` - Create direct chat
- `POST /api/chats/group` - Create group chat
- `GET /api/chats/:chatId/messages` - Get messages
- `POST /api/chats/:chatId/messages` - Send message

### Vendors

- `GET /api/cities` - Get all cities
- `GET /api/cities/:cityId/vendor-types` - Get vendor types
- `GET /api/cities/:cityId/vendors/:typeId` - Get vendors

### Health

- `GET /health` - Server health check

## Socket.IO Events

### Client → Server

- `chat:join` - Join a chat room
- `chat:leave` - Leave a chat room
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `message:read` - Mark message as read

### Server → Client

- `message:new` - New message in chat
- `message:read` - Message read by user
- `message:reaction` - Emoji reaction added/removed
- `message:edited` - Message content edited
- `message:deleted` - Message deleted for everyone
- `typing:start` - User is typing
- `typing:stop` - User stopped typing
- `user:online` - User came online
- `user:offline` - User went offline

## Development

### Available Scripts

#### Backend

```bash
npm run dev      # Start with nodemon (auto-reload)
npm start        # Start production server
npm run seed     # Seed database with sample data
```

#### Mobile

```bash
npm start        # Start Expo development server
npm run android  # Run on Android emulator
npm run ios      # Run on iOS simulator
npx expo start -c # Start with cleared cache
```

### Code Architecture

#### Centralized Configuration

All environment variables are managed through centralized config files:

- Backend: `server/src/config/env.js`
- Mobile: `mobile/constants/constants.ts`

This ensures:

- Single source of truth for configuration
- Easy updates when deploying
- Type safety and validation
- DRY principles

#### DRY Utilities

Common patterns are abstracted into utility modules:

- `server/src/utils/populate.js` - Mongoose population patterns
- `server/src/utils/response.js` - Standardized API responses

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive deployment instructions covering:

- Backend deployment (Railway, Render, DigitalOcean, AWS)
- Mobile app deployment (Expo Go, Development Builds, Production)
- Environment configuration for production
- Testing checklist
- Troubleshooting guide

## Security

- JWT-based authentication with bcrypt password hashing
- Environment variables for sensitive data
- CORS configuration for API security
- Socket.IO authentication middleware
- Input validation on all endpoints
- Secure token storage using Expo Secure Store

## Troubleshooting

### Backend won't start

- Check MongoDB connection string is correct
- Verify all required environment variables are set
- Check port 3000 is not already in use

### Mobile app can't connect to backend

- Ensure backend is running
- Verify phone and computer on same network
- Check `EXPO_PUBLIC_API_URL` is set correctly for production
- Review backend logs for CORS errors

### Database connection issues

- Verify MongoDB Atlas IP whitelist includes your IP
- Check database user has proper permissions
- Test connection string directly with MongoDB Compass

### Socket.IO not connecting

- Verify backend Socket.IO is initialized
- Check CORS settings allow Socket connections
- Review client logs for connection errors

## License

This project is private and proprietary.

## Support

For issues and questions:

- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment help
- Review server logs for backend errors
- Check mobile console for client errors
- Verify environment variables are set correctly
