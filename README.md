# CrowdFUNding - Backend Server

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18.0-green?logo=node.js" alt="Node.js Version"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Express-4.21-black?logo=express" alt="Express"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16.0-blue?logo=postgresql" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License"/>
</p>

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Setup](#environment-setup)
- [Project Structure](#project-structure)
- [Database Architecture](#database-architecture)
- [API Endpoints](#api-endpoints)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The **CrowdFUNding Backend** is an **Express.js** server built with TypeScript that serves as the central API layer for the CrowdFUNding platform. It handles authentication, caches blockchain data, and stores off-chain information.

### Key Responsibilities

- **User Authentication**: Google OAuth and wallet-based login management
- **Data Caching**: PostgreSQL database for off-chain data and blockchain state caching
- **Auto-Sync**: Background service for automatic synchronization with the Ponder indexer
- **API Layer**: RESTful API endpoints for the frontend application
- **Achievement System**: Badge management and minting logic
- **Social Features**: Share link generation and tracking

---

## Architecture

The backend follows a layered architecture pattern that separates concerns and improves maintainability.

```mermaid
flowchart TB
    subgraph API["API Layer"]
        Routes["Express Routes"]
        Middleware["Middleware (Auth, Validation, CORS)"]
    end

    subgraph Business["Business Layer"]
        AuthCtrl["Auth Controller"]
        VaultCtrl["Vault Controller"]
        ContribCtrl["Contribution Controller"]
        AchieveCtrl["Achievement Controller"]
        SyncCtrl["Sync Controller"]
    end

    subgraph Data["Data Layer"]
        Models["Sequelize Models"]
        PonderClient["Ponder API Client"]
    end

    subgraph External["External Services"]
        PostgreSQL[(PostgreSQL)]
        Ponder["Ponder Indexer"]
        Google["Google OAuth"]
    end

    Routes --> Middleware --> Business
    Business --> Data
    Models --> PostgreSQL
    PonderClient --> Ponder
    AuthCtrl --> Google
```

### Key Architectural Decisions

| Decision                 | Implementation                  | Benefit                                |
| ------------------------ | ------------------------------- | -------------------------------------- |
| **Layered Architecture** | Routes to Controllers to Models | Separation of concerns, testability    |
| **PostgreSQL Caching**   | Store indexed data locally      | Fast queries, reduced Ponder load      |
| **Auto-Sync Service**    | 30-second polling from Ponder   | Near real-time data without WebSockets |
| **Passport.js Auth**     | Google OAuth + JWT              | Flexible authentication strategies     |

---

## Tech Stack

| Category           | Technology         | Description                              |
| ------------------ | ------------------ | ---------------------------------------- |
| **Runtime**        | Node.js            | JavaScript runtime environment           |
| **Language**       | TypeScript         | Static typing for reliability            |
| **Framework**      | Express.js         | Fast, unopinionated web framework        |
| **Database**       | PostgreSQL         | Relational database management system    |
| **ORM**            | PG / Custom        | Direct database interaction              |
| **Authentication** | Passport.js        | Authentication middleware (Google OAuth) |
| **Security**       | BCrypt / JWT       | Hashing and session tokens               |
| **AI Integration** | LangChain / Gemini | Generative AI features                   |

---

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js**: v18 or higher
- **PostgreSQL**: Local instance or cloud-hosted URL
- **Package Manager**: npm, yarn, or pnpm

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/CrowdFUNding-Base/BE.git
   cd BE
   ```

2. **Install dependencies**:

   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Database Setup**:
   Run the setup script to initialize the database schema:

   ```bash
   npm run db:setup
   ```

4. **Start the Development Server**:
   ```bash
   npm start
   ```

The server will start at `http://localhost:3300`.

---

## Environment Setup

Create a `.env` file in the project root with the following configuration:

```env
# ============================
# Server Configuration
# ============================
PORT=3300
NODE_ENV=development

# ============================
# Database (PostgreSQL)
# ============================
DATABASE_URL=postgresql://username:password@localhost:5432/crowdfunding

# ============================
# Authentication
# ============================
SESSION_SECRET=your-super-secret-session-key
JWT_SECRET=your-jwt-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ============================
# Frontend URL (for CORS)
# ============================
FRONTEND_URL=http://localhost:3000

# ============================
# Ponder Indexer
# ============================
PONDER_URL=http://localhost:42069

# ============================
# Blockchain Configuration
# ============================
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your-private-key-for-minting

# ============================
# AI Integration (Optional)
# ============================
GOOGLE_AI_API_KEY=your-google-ai-api-key
```

### How to Obtain Keys

| Variable            | How to Obtain                                  |
| ------------------- | ---------------------------------------------- |
| `DATABASE_URL`      | Create free PostgreSQL at Supabase or Neon     |
| `GOOGLE_CLIENT_ID`  | Google Cloud Console APIs Credentials          |
| `RPC_URL`           | Alchemy or Infura Base Sepolia App             |
| `PRIVATE_KEY`       | Export from MetaMask (for server-side signing) |
| `GOOGLE_AI_API_KEY` | Google AI Studio                               |

---

## Project Structure

```
├── app.ts                    # Main entry point
├── config/
│   └── database.ts          # PostgreSQL connection config
├── controllers/
│   ├── achievementController.ts  # Badge/achievement logic
│   ├── authController.ts         # Authentication handlers
│   ├── contributionController.ts # QRIS payment handling
│   ├── shareController.ts        # Social sharing features
│   ├── syncController.ts         # Ponder data sync
│   └── vaultController.ts        # Campaign/vault CRUD
├── middleware/
│   └── auth.ts              # JWT authentication middleware
├── models/
│   ├── achievementModel.ts  # Achievement data model
│   ├── shareModel.ts        # Share link model
│   ├── userModel.ts         # User data model
│   └── vaultModel.ts        # Campaign/vault model
├── routes/
│   ├── auth.ts              # Authentication routes
│   ├── crowdfunding.ts      # Main API routes
│   └── sync.ts              # Sync endpoints
├── services/
│   └── autoSync.ts          # Background Ponder sync service
├── sql/                     # Database migrations
├── scripts/
│   ├── initialSync.ts       # Initial data sync script
│   └── setupDatabase.ts     # DB setup script
└── utils/                   # Utility functions
```

---

## Database Architecture

The backend uses PostgreSQL for persistent storage.

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email
        varchar wallet_address
        varchar name
        timestamp created_at
    }

    VAULTS {
        integer id PK
        varchar name
        varchar creator_name
        text description
        varchar image_url
        varchar owner
        decimal balance
        decimal target_amount
        timestamp created_at
    }

    ACHIEVEMENTS {
        uuid id PK
        uuid user_id FK
        integer vault_id FK
        varchar badge_type
        integer token_id
        timestamp earned_at
    }

    SHARES {
        uuid id PK
        varchar short_code UK
        integer vault_id FK
        uuid created_by FK
        integer click_count
        timestamp created_at
    }

    USERS ||--o{ ACHIEVEMENTS : "earns"
    USERS ||--o{ SHARES : "creates"
    VAULTS ||--o{ ACHIEVEMENTS : "triggers"
    VAULTS ||--o{ SHARES : "promotes"
```

---

## API Endpoints

All routes are prefixed with `/crowdfunding`.

### Authentication

| Method | Endpoint        | Description          |
| ------ | --------------- | -------------------- |
| POST   | `/google-login` | Google OAuth login   |
| POST   | `/wallet-login` | Wallet-based login   |
| GET    | `/auth/status`  | Check session status |
| POST   | `/auth/logout`  | End session          |

### Campaigns

| Method | Endpoint        | Description         |
| ------ | --------------- | ------------------- |
| GET    | `/vaults`       | List all campaigns  |
| GET    | `/vault/:id`    | Get single campaign |
| POST   | `/vault/create` | Create campaign     |
| PATCH  | `/vault/:id`    | Update campaign     |

### Achievements

| Method | Endpoint                 | Description           |
| ------ | ------------------------ | --------------------- |
| GET    | `/achievements`          | Get user achievements |
| POST   | `/achievements/:id/mint` | Mint badge as NFT     |

---

## Deployment

### Vercel

The project is configured for serverless deployment on Vercel.

```bash
vercel --prod
```

### Railway / Render

1.  Connect your GitHub repository
2.  Set environment variables
3.  **Build Command**: `npm run build`
4.  **Start Command**: `npm start`

---

## Troubleshooting

| Issue                          | Solution                                                    |
| ------------------------------ | ----------------------------------------------------------- |
| **Database Connection Failed** | Ensure PostgreSQL is running and `DATABASE_URL` is correct. |
| **CORS Errors**                | Add your frontend URL to `FRONTEND_URL` in `.env`.          |
| **Ponder Sync Failed**         | Check that the Ponder indexer is running at `PONDER_URL`.   |

---

## Contributing

Contributions are welcome. Please submit a Pull Request.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<p align="center">
  Made with ❤️ by UGM BCC
</p>
