# Innova Backend Serverless

## Introduction

The **Innova Backend Serverless** is the core backend repository for the Innova EdTech platform, designed specifically to evaluate cognitive profiles (FSLSM) from students via telemetry. Built using **NestJS**, **TypeScript (strict)**, and **AWS Serverless infrastructure (Lambda, API Gateway, SQS)**, it provides zero-idle costs, extreme scalability, and robust typing from ingestion to processing.

---

## 📑 Index

- [Innova Backend Serverless](#innova-backend-serverless)
  - [Introduction](#introduction)
  - [📑 Index](#-index)
  - [Architecture \& Workflow](#architecture--workflow)
    - [Integration Workflow: NNA to Teacher](#integration-workflow-nna-to-teacher)
    - [Mermaid Flowchart](#mermaid-flowchart)
  - [Polyglot Persistence Scheme](#polyglot-persistence-scheme)
  - [Environment Configuration](#environment-configuration)
  - [Deployment (CI/CD)](#deployment-cicd)
  - [Local Development](#local-development)
  - [Commands](#commands)
  - [License](#license)

---

## Architecture & Workflow

The architecture resolves high-throughput constraints strictly by delegating operations through Event-Driven approaches via SQS FIFO and isolating storage concerns with CQRS strategies.

### Integration Workflow: NNA to Teacher

1. **Ingestion & Validation**: Gameplay actions from NNA (children & adolescents) are received at the AWS API Gateway endpoint (`/telemetry/ingest`).
2. **Buffering**: Validated data constructs are published to an `.fifo` SQS queue asynchronously.
3. **Processing (The Worker)**: `TelemetryWorker` consumes batches matching exactly `< 10` messages concurrently.
4. **Storage Offloading**: The payload writes to a high-speed NoSQL database (MongoDB Atlas) to prevent lock-contention.
5. **AI Inference Link**: Background processes later read the unstructured collections, interpret cognitive profile logic, and aggregate insights onto a relational core (PostgreSQL) where Teachers access standard FSLSM statistics.

### Mermaid Flowchart

```mermaid
flowchart TD
    A[Minigame Client] -->|RawTelemetry JSON| B(API Gateway)
    B -->|Fast Response 202| A
    B -. Async Context .-> C[AWS SQS FIFO TelemetryQueue]
    C -->|Trigger Batch| D[AWS Lambda: Telemetry Worker]
    D -->|"insertMany()"| E[("MongoDB: Raw Telemetry Firehose")]
    D --> F{Validation}
    F -->|Fail| G[Dead Letter Queue]
    
    H[Teacher Dashboard] -->|FSLSM Search| I(API Gateway REST)
    I -->|Fetch Profiles| J[("PostgreSQL: Neon Profiles")]
    
    style E fill:#d4ffb8,stroke:#4caf50
    style J fill:#b8d4ff,stroke:#2196f3
```

---

## Polyglot Persistence Scheme

We strictly follow a Polyglot Persistence methodology represented locally in our `docs/` folder DBML structures:

1. **[PostgreSQL Profiles ERD (DBML)](docs/postgresql-profiles.dbml)** - Handled via **Prisma ORM** for structured, consistent `Users` & `FslsmProfiles`. Provides ACID compliance for the learning administration.
2. **[MongoDB Telemetry Schema (DBML)](docs/mongodb-telemetry.dbml)** - Handled via **Mongoose** for raw game metrics (Heavy non-structured JSON payload inserts via `insertMany`), offloading huge write pressures from PostgreSQL.

---

## Environment Configuration

Create a `.env` file referencing `.env.example`. Make sure you inject absolute MongoDB cluster URLs:

```env
# Local Development (Docker Compose)
DATABASE_URL="postgresql://postgres:innova_secret@localhost:5432/innova_dev_db?schema=public"

# Production / Cloud Database (Neon)
# DATABASE_URL="postgresql://neon_user:neon_password@ep-neon-endpoint.region.aws.neon.tech/neon_db?sslmode=require"

MONGODB_URI="mongodb+srv://innova_backend:auto_generated_password@cluster0.mongodb.net/innova_telemetry_dev?retryWrites=true&w=majority"
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_REGION="us-east-1"

```

---

## Deployment (CI/CD)

The project leverages **GitHub Actions** and the **Serverless Framework** (`serverless.yml`).

We execute our CI/CD workflows under `.github/workflows/deploy.yml`. When pushing to `main`, the CI checks typings, formatting, and runs Jest. Upon success, Serverless connects via injected repository secrets to deploy endpoints dynamically to AWS Lambda.

**Required GitHub Repository Secrets**:

- `AWS_ACCESS_KEY_ID`: IAM user `innova-serverless-deployer`
- `AWS_SECRET_ACCESS_KEY`: Key context
- `DATABASE_URL`: Resolving to Cloud Neon DB.
- `MONGODB_URI`: Atlas Cluster endpoint pointing to `innova_telemetry_prod`.

---

## Local Development

For Zero-Cost development, a containerized Postgres instance is deployed. Follow these steps:

1. Install dependencies strictly using pnpm:

   ```bash
   pnpm install
   ```

2. Startup local Postgres:

   ```bash
   docker-compose up -d
   ```

3. Boot the API:

   ```bash
   pnpm run start:dev
   ```

## Commands

```bash
# Linter & Formatting
pnpm run format
pnpm exec eslint . --ext .ts

# Unit Tests (Strict Service mocking logic with Typescript Coverage)
pnpm run test

# End-to-End Tests (Utilizes complex Supertest overrides intercepting the Mongoose layer)
pnpm run test:e2e
```

## License

Innova - Team 23. Internal GPL-3.0 License.
