# Innova Backend Serverless

## Introduction

The **Innova Backend Serverless** is the core backend repository for the Innova EdTech platform, designed specifically to evaluate cognitive profiles (FSLSM) from students via telemetry. Built using **NestJS**, **TypeScript (strict)**, and **AWS Serverless infrastructure (Lambda, API Gateway, SQS)**, it provides zero-idle costs, extreme scalability, and robust typing from ingestion to processing.

---

## 📑 Index

- [Innova Backend Serverless](#innova-backend-serverless)
  - [Introduction](#introduction)
  - [📑 Index](#-index)
  - [Architecture \& Data Flow](#architecture--data-flow)
  - [Project Context \& Domain](#project-context--domain)
    - [Core Features](#core-features)
  - [Technologies \& Packages](#technologies--packages)
  - [Project Structure Analysis](#project-structure-analysis)
    - [Purpose of Empty Folders](#purpose-of-empty-folders)
  - [Local Setup \& Development](#local-setup--development)
  - [AWS Serverless Deployment](#aws-serverless-deployment)
  - [License](#license)

---

## Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Data_Sources ["Telemetry Sources"]
        Client[Frontend/Minigame]
    end

    subgraph API_Layer ["API Gateway / NestJS Controllers"]
        TelemetryCtrl[TelemetryController]
        ProfilesCtrl[ProfilesController]
        MaterialCtrl[MaterialsController]
    end

    subgraph Service_Processing ["Domain & Services"]
        IngestionSvc[Telemetry Ingestion]
        ProfileCalcSvc[FSLSM Engine]
        RecommSvc[Recommendation AI Engine]
    end

    subgraph Databases ["Polyglot Persistence"]
        DB_Mongo[(Mongoose / MongoDB)\nRaw Telemetry]
        DB_Postgres[(Prisma / PostgreSQL)\nProfiles & Material]
    end

    Client -->|1. Firehose Telemetry (NoSQL)| TelemetryCtrl
    TelemetryCtrl --> IngestionSvc
    IngestionSvc -->|Save| DB_Mongo
    IngestionSvc -->|SQS Queue| ProfileCalcSvc
    ProfileCalcSvc -->|Calculate & Store| DB_Postgres

    Client -->|2. Request Next Lesson| MaterialCtrl
    MaterialCtrl --> RecommSvc
    RecommSvc -->|Fetch FSLSM & Materials| DB_Postgres
    RecommSvc -->|Adaptive Filtering| MaterialCtrl
    MaterialCtrl -->|3. Return Adapted Content| Client
```

---

## Project Context & Domain

Domain: EdTech platform using Dual AI to infer cognitive profiles (FSLSM) continuously from student telemetry (NoSQL) and orchestrate Adaptive Learning Systems to customize educational material delivery (SQL).

### Core Features

- **Telemetry Ingestion:** High-throughput event ingestion (NoSQL).
- **Profile Generation:** FSLSM calculation based on game-based learning data.
- **Adaptive Material Selection:** Euclidean Distance ranking over multidimensional metadata objects.

---

## Technologies & Packages

- **NestJS:** Strict TypeScript execution framework.
- **Prisma & Mongoose:** Polyglot persistence across Neon (PostgreSQL) and Atlas (MongoDB).
- **Serverless Framework:** Complete AWS IaC scaffolding (`serverless.yml`).
- **Swagger (@nestjs/swagger):** Fully decorated REST API endpoint generation.
- **Jest & Supertest:** Multi-tier testing implementation (Unit/E2E).

---

## Project Structure Analysis

The backend structure uses a strict **Clean Architecture (Domain-Driven)** paradigm:

```
src/
├── application/     # Contains the business use cases (Services) acting as orchestrators.
│   ├── materials/   # Material management use cases
│   ├── profiles/    # Profile generation use cases
│   ├── recommendations/ # Recommendation logic use cases
│   └── telemetry/   # Telemetry processing use cases
├── domain/          # Core entities, strictly decoupled from frameworks.
│   ├── profiles/    # Rules regarding the FSLSM profiles.
│   └── telemetry/   # Definitions for telemetry structures.
├── infrastructure/  # Everything framework, db, or protocol-specific.
│   ├── aws/         # SQS/Lambda integrations
│   ├── database/    # Prisma & Mongoose connection setups
│   ├── external/    # AI engines or external HTTP calls
│   └── http/        # NestJS Controllers parsing HTTP traffic.
├── materials/       # The Material Module configuration.
├── profiles/        # The Profiles Module configuration.
├── recommendations/ # The Recommendations Module configuration.
└── shared/          # Shared utilities and global exceptions.
    ├── exceptions/  # App-wide global exception filters handling internal routing to HTTP codes.
    └── utils/       # General logic (dates, math).
```

### Purpose of Empty Folders

- `src/domain/telemetry/`: Reserved for mathematical equations parsing NoSQL schema inputs over time (future domain rules for the Firehose).
- `src/infrastructure/external/`: Reserved for interacting with specialized Python AI engines using TCP/HTTP wrappers.
- `src/infrastructure/aws/`: Intended to hold S3 bucket utilities or decoupled SNS topics.

---

## Local Setup & Development

1. Open `docker-compose.yml` to ensure local PostgreSQL and MongoDB databases are up: `docker-compose up -d`.
2. Map your `.env` (provided via `.env.example`).
3. Deploy Prisma definitions: `npx prisma db push` and `npx prisma generate`.
4. Run server: `npm run start:dev`.

## AWS Serverless Deployment

1. Ensure AWS CLI profiles are configured (`~/.aws/credentials`).
2. Build NestJS: `npm run build`.
3. Use Serverless Framework: `npx serverless deploy --stage dev`.

## License

Innova - Team 23. Internal GPL-3.0 License.
