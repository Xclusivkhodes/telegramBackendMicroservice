# The Martyrs — Telegram Audio Streaming Backend

A Node.js/TypeScript backend that streams audio sermons stored in private Telegram channels directly to web clients. It uses Telegram's MTProto protocol (via GramJS) to authenticate users, fetch audio files, and pipe them as HTTP range-request streams — no file downloads, no S3, no CDN for the audio itself.

---

## How It Works

```
User registers
    │
    ▼
Telegram OTP sent to phone
    │
    ▼
User submits OTP → session string saved to DB
    │
    ▼
User requests  GET /stream/:channelId/:messageId
    │
    ▼
TelegramManager returns a pooled MTProto client
    │
    ▼
iterDownload pipes audio bytes → HTTP 206 response
    │
    ▼
Browser <audio> element plays the stream
```

A daily cron job (3 AM, Africa/Accra) crawls the configured Telegram channels, extracts audio metadata, uploads thumbnails to Cloudinary, and upserts everything into MongoDB. The frontend queries this catalogue via GraphQL.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript |
| HTTP Server | Express 5 |
| API | Apollo Server 4 (GraphQL) |
| Permissions | graphql-shield + graphql-middleware |
| Telegram | GramJS (MTProto) |
| Database | MongoDB via Mongoose |
| Image CDN | Cloudinary |
| Auth | JWT (httpOnly cookies) + bcrypt |
| Rate Limiting | express-rate-limit |
| Scheduler | node-cron |
| Deployment | Docker / Vercel |

---

## Project Structure

```
src/
├── server.ts                        # Entry point — wires everything together
├── config/
│   └── db.ts                        # MongoDB connection
├── lib/
│   ├── telegram.ts                  # TelegramClient factory + admin session CLI
│   └── telegramManager.ts           # MTProto client pool (one client per user)
├── models/
│   ├── User.ts                      # User schema (stores sessionString, role, etc.)
│   └── Audio.ts                     # Sermon metadata schema
├── middleware/
│   ├── auth.ts                      # JWT verification for REST routes
│   ├── permissions.ts               # graphql-shield rules (isAuthenticated, isAdmin)
│   └── rateLimiter.ts               # express-rate-limit for /refresh endpoint
├── controllers/
│   ├── streamAudio.ts               # Core streaming controller (HTTP range support)
│   ├── refreshAccessToken.ts        # JWT token rotation
│   └── sharingController.ts         # Open Graph meta injection for share links
├── services/
│   └── channelCrawler.ts            # Telegram channel sync (runs via cron)
├── utils/
│   ├── AppError.ts                  # Custom error class with structured logging
│   ├── auth.ts                      # JWT generation helper
│   ├── cloudinaryUtil.ts            # Cloudinary upload wrapper
│   └── pendingAuthClients.ts        # Temporary client store for OTP login flow
└── graphql/
    ├── schema/
    │   ├── schema.ts                # Merges all type definitions
    │   ├── userSchema.ts            # User types and mutations
    │   ├── audioShema.ts            # Audio types, queries, mutations
    │   └── testSchema.ts            # Dev-only test query
    ├── resolvers/
    │   ├── resolvers.ts             # Builds schemaWithPermissions (shield + middleware)
    │   ├── signupResolver.ts        # Auth resolver barrel (me, users, register, login…)
    │   ├── audioResolvers.ts        # Audio resolver barrel (queries + mutations)
    │   ├── testResolver.ts          # Dev-only: manually trigger a channel sync
    │   ├── signupResolvers/         # Individual auth resolver functions
    │   │   ├── registerUser.ts
    │   │   ├── verifyTelegramLogin.ts
    │   │   ├── login.ts
    │   │   └── logout.ts
    │   └── audioResolvers/          # Individual audio resolver functions
    │       ├── audioMutations/
    │       │   ├── addAudio.ts
    │       │   ├── updateAudio.ts
    │       │   └── deleteAudio.ts
    │       └── audioQueries/
    │           ├── allAudios.ts
    │           ├── audio.ts
    │           ├── audiosByPreacher.ts
    │           └── getAudios.ts
    └── dataSources/
        ├── UserDataSource.ts        # DB access layer for users
        └── AudioDataSources.ts      # DB access layer for audio records
```

---

## Prerequisites

- Node.js 20+
- A MongoDB Atlas cluster (or local MongoDB)
- A Telegram account and an app registered at [my.telegram.org/apps](https://my.telegram.org/apps)
- A Cloudinary account

---

## Environment Variables

Create a `.env` file in the project root. All variables are required unless marked optional.

```env
# ── Server ────────────────────────────────────────────────────────────────────
PORT=7860                          # Port the HTTP server listens on (default: 7860)

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>

# ── Telegram MTProto ──────────────────────────────────────────────────────────
# Get these from https://my.telegram.org/apps
TG_API_ID=12345678
TG_API_HASH=abcdef1234567890abcdef1234567890

# The admin/system session string used by the channel crawler.
# Generate this once using the CLI utility (see "Generating a Session String" below).
TG_STRING_SESSION=1BVtsOKABu...

# ── JWT ───────────────────────────────────────────────────────────────────────
# Use long, random strings. Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# ── Cloudinary ────────────────────────────────────────────────────────────────
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Environment ───────────────────────────────────────────────────────────────
NODE_ENV=development               # Set to "production" to disable GraphQL introspection
```

### Generating a Session String

The `TG_STRING_SESSION` is a serialised Telegram login session for the admin account that the crawler uses. You only need to generate this once.

Run the following from the project root:

```bash
npx tsx src/lib/telegram.ts
```

It will prompt for your phone number, the SMS/app code Telegram sends, and your 2FA password (if enabled). Copy the printed session string into your `.env` file.

> **Security note:** The session string grants full Telegram account access. Treat it like a password. Never commit it to version control.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the template above into a `.env` file and fill in all values.

### 3. Generate the admin session string

```bash
npx tsx src/lib/telegram.ts
```

Copy the output into `TG_STRING_SESSION` in your `.env`.

### 4. Start the development server

```bash
npm run dev
```

The server starts on `http://localhost:7860` with hot-reload via `tsx --watch`.

### 5. Verify it's running

```bash
curl http://localhost:7860/health
# → {"status":"alive","message":"The Martyrs API is active"}
```

### 6. Open the GraphQL playground

Navigate to `http://localhost:7860` in your browser. Apollo Sandbox will load (only available when `NODE_ENV` is not `"production"`).

---

## API Reference

### REST Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness probe |
| POST | `/refresh` | refresh_token cookie | Rotate JWT tokens (rate-limited: 10 req / 15 min) |
| GET | `/stream/:channelId/:messageId` | access_token cookie | Stream audio (HTTP range) |
| GET | `/share/:channelId/:messageId` | None | OG meta HTML for share links |

### GraphQL Operations

All GraphQL operations are sent to `POST /`.

#### Authentication Flow

```graphql
# Step 1: Register — also triggers Telegram OTP
mutation Register {
  registerUser(input: {
    firstName: "John"
    lastName: "Doe"
    username: "johndoe"
    email: "john@example.com"
    phoneNumber: "+233201234567"
    password: "securepassword"
  }) {
    id
    firstName
  }
}

# Step 2: Submit the OTP code received on your phone
mutation VerifyOTP {
  verifyTelegramLogin(input: {
    code: "12345"
  }) {
    id
  }
}

# Login (for returning users)
mutation Login {
  login(input: {
    email: "john@example.com"
    password: "securepassword"
  }) {
    id
    firstName
  }
}

# Logout
mutation Logout {
  logout
}
```

#### Audio Queries

```graphql
# Paginated list of all sermons (10 per page)
query GetAudios {
  getAudios(first: 10) {
    edges {
      cursor
      node {
        id
        title
        preacher
        channelId
        messageId
        imageUrl
        duration
        mimeType
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Next page — pass endCursor as the `after` argument
query GetAudiosPage2 {
  getAudios(first: 10, after: "<endCursor>") {
    edges { node { title } }
    pageInfo { hasNextPage endCursor }
  }
}

# Search by title or preacher name
query SearchAudio {
  audio(title: "grace") {
    id
    title
    preacher
    channelId
    messageId
  }
}

# All sermons by a specific preacher (paginated)
query ByPreacher {
  audiosByPreacher(preacher: "Bro. Gbile Akanni", first: 20) {
    edges { node { title duration } }
    pageInfo { hasNextPage endCursor }
  }
}
```

#### Streaming an Audio File

Once you have a `channelId` and `messageId` from a GraphQL query, stream the audio:

```
GET /stream/<channelId>/<messageId>
Cookie: access_token=<your_jwt>
Range: bytes=0-                    (optional — omit for full file)
```

The response is `206 Partial Content` with `Content-Range`, `Accept-Ranges`, and `Content-Length` headers. A standard HTML `<audio>` element handles this automatically:

```html
<audio controls src="https://your-api.com/stream/1001140281557/42"></audio>
```

---

## Deployment

### Docker

```bash
# Build
docker build -t the-martyrs-api .

# Run
docker run -p 7860:7860 --env-file .env the-martyrs-api
```

The Dockerfile uses a two-stage build: TypeScript is compiled in the builder stage, and only the compiled `dist/` and production `node_modules` are copied to the final image.

### Vercel

The `vercel.json` at the project root routes all traffic to `src/server.ts`. Deploy with:

```bash
vercel --prod
```

> **Note:** Vercel's serverless functions have a 10-second timeout by default. Long-running streams may be cut off. A persistent server (Docker, Railway, Render) is recommended for production streaming.

---

## Adding New Telegram Channels

1. Open `src/server.ts` and add the channel ID to the `CHANNELS` array:
   ```ts
   const CHANNELS = [
     "-1001140281557",
     "-1001079635237",  // ← add here
   ];
   ```
2. The next 3 AM cron run will crawl the new channel automatically.
3. To sync immediately without waiting, call the `testAudios` GraphQL query (admin only, development).

---

## User Roles

| Role | Permissions |
|---|---|
| `user` | Read audio catalogue, stream audio |
| `preacher` | Same as user (reserved for future use) |
| `admin` | All of the above + `addAudio`, `updateAudio`, `deleteAudio` mutations, `users` query |

Roles are set in the database. To promote a user to admin, update their document directly in MongoDB Atlas.

---

## Key Design Decisions

**Why graphql-shield for permissions instead of inline resolver guards?**
Each resolver used to call an `adminOnly()` wrapper directly. Moving auth rules into `permissions.ts` (graphql-shield) keeps resolvers focused on business logic and makes the permission matrix visible in one place. Rules are cached per-context so they don't re-run on every field in a request.

**Why MTProto instead of the Bot API?**
The Bot API doesn't support streaming large files with range requests. MTProto's `iterDownload` lets us seek to any byte offset, which is required for audio scrubbing.

**Why one client per user?**
Each Telegram session is tied to a specific account. The channel crawler uses the admin session; each end-user streams through their own session. This avoids rate-limit sharing and keeps sessions isolated.

**Why httpOnly cookies instead of Authorization headers?**
httpOnly cookies are not accessible to JavaScript, which prevents XSS attacks from stealing tokens. The `sameSite: "none"` + `secure: true` combination allows cross-origin requests from the frontend while keeping the tokens safe.

**Why cursor pagination instead of offset?**
Offset pagination skips or repeats items when records are inserted or deleted between pages. Cursor pagination is stable regardless of concurrent writes.

**Why is GraphQL introspection disabled in production?**
Introspection lets any client enumerate every type, field, and mutation in the schema — a reconnaissance gift to an attacker. It is disabled when `NODE_ENV=production` and left on in development for Apollo Sandbox.

---

## Scripts

```bash
npm run dev      # Start with hot-reload (tsx --watch)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled output (production)
```
