# Auth Integration Guide — Innova Backend + Clients

> **Última actualización:** 2026-05-02  
> **Versión:** 1.0 — MVP authentication complete  
> **Cobertura:** Cognito JWT validation, user linking, role-based access control (RBAC), demo users

---

## Table of Contents

1. [What's Included in This Auth Integration](#whats-included)
2. [Architecture Overview](#architecture-overview)
3. [Backend Auth Components](#backend-auth-components)
4. [Client Integration (Expo, Next.js, Astro)](#client-integration)
5. [Authentication Flows](#authentication-flows)
6. [Error Handling](#error-handling)
7. [Security & Best Practices](#security--best-practices)
8. [Demo Setup](#demo-setup)

---

## What's Included in This Auth Integration

This is a **production-ready JWT-based authentication system** that integrates AWS Cognito with the Innova backend. Here's what you get:

### ✅ What's Included

#### 1. **Real AWS Cognito Integration**

- ✅ JWT validation via JWKS (real cryptographic signature validation)
- ✅ No demo mode or bypass — tokens are validated against Cognito's public keys
- ✅ Support for Cognito user groups (TEACHER, STUDENT, ADMIN)
- ✅ Automatic linking of Cognito subjects (`sub`) to local Prisma users

#### 2. **User Management**

- ✅ User resolution by `cognitoSub` (fastest path)
- ✅ User resolution by `email` (if Cognito sub is unknown)
- ✅ Auto-linking: on first login with valid JWT, link `cognitoSub` to existing Prisma user
- ✅ Support for nullable `cognitoSub` (backward compatibility)

#### 3. **Role-Based Access Control (RBAC)**

- ✅ Three roles: `TEACHER`, `STUDENT`, `ADMIN`
- ✅ Roles extracted from Cognito groups (`cognito:groups`)
- ✅ Route-level guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.TEACHER)`
- ✅ Graceful 403 Forbidden for insufficient permissions

#### 4. **Bearer Token Handling**

- ✅ Automatic extraction from `Authorization: Bearer <token>` header
- ✅ Malformed token detection (returns 401)
- ✅ Missing header detection (returns 401)
- ✅ Token expiration validation (Cognito handles clock skew)

#### 5. **Comprehensive Testing**

- ✅ Unit tests for `JwtStrategy` (token validation, role extraction, user linking)
- ✅ Unit tests for `UsersService` (find/link logic, edge cases)
- ✅ E2E tests for full Bearer token flow (protected routes, RBAC, error scenarios)
- ✅ Coverage ≥75% on auth module

#### 6. **Demo Users (Seed Data)**

- ✅ Teacher account: `teacher@innova.demo` (cognitoSub: `us-east-1:00000000-0000-0000-0000-000000000001`)
- ✅ 5 Student accounts: `student1–5@innova.demo` (cognitoSub: deterministic UUIDs)
- ✅ School, classroom, and skill setup for immediate demo
- ✅ No admin endpoint — seed is the only way to populate demo data

#### 7. **Structured Logging & Observability**

- ✅ Trace ID propagation via middleware
- ✅ Structured JSON logs with `x-trace-id` in every request
- ✅ Clear error messages for auth failures (no PII leaked)

---

### ❌ What's NOT Included (Cognito Handles These)

| Feature | Handler | Your Clients Must |
|---------|---------|-------------------|
| **User Registration** | Cognito user pool | Call Cognito `SignUp` API or use Cognito UI |
| **Login** | Cognito `initiate-auth` | Call Cognito `AuthFlow` to get tokens |
| **Password Reset** | Cognito email service | Call Cognito `ForgotPassword` + `ConfirmForgotPassword` |
| **MFA/TOTP** | Cognito MFA | Implement TOTP challenge flow (optional in MVP) |
| **Token Refresh** | Cognito refresh flow | Call Cognito `InitiateAuth` with refresh token |
| **Logout** | Client-side (clear tokens) | Delete tokens from local storage; Cognito doesn't revoke access tokens |

**Key point:** The backend **validates** JWTs; it does **not issue or refresh** them. Cognito is your identity provider.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATIONS                          │
├────────────────┬──────────────────────────┬────────────────────┤
│ Expo (Mobile)  │ Next.js (Web)            │ Astro (Static Web) │
│ React Native   │ React + TypeScript       │ Prerendered HTML   │
└────────┬────────┴──────────────┬───────────┴────────────┬───────┘
         │                       │                        │
         │ 1. Call Cognito Auth  │                        │
         │ 2. Receive JWT tokens │                        │
         └───────────┬───────────┴────────────┬───────────┘
                     │                        │
                     │ 3. Include Bearer token in every API call
                     │    Authorization: Bearer <access_token>
                     │
    ┌────────────────▼────────────────────────────────────────┐
    │           AWS API GATEWAY + LAMBDA                      │
    │           (innova-backend-serverless)                   │
    └──────────────┬─────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────┐
    │         JWT VALIDATION LAYER (JwtStrategy)            │
    │  • Extract Bearer token from Authorization header      │
    │  • Validate RS256 signature via Cognito JWKS          │
    │  • Deserialize payload { sub, email, cognito:groups } │
    └──────────────┬─────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────┐
    │        USER LINKING LAYER (UsersService)              │
    │  • Find user by cognitoSub (fast path)                 │
    │  • Find user by email (if cognitoSub unknown)          │
    │  • Auto-link cognitoSub on first login                 │
    │  • Return LinkedPrismaUser + role                      │
    └──────────────┬─────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────┐
    │      ROLE-BASED ACCESS CONTROL (RolesGuard)           │
    │  • Check if user role matches route @Roles()          │
    │  • 403 Forbidden if insufficient permissions           │
    └──────────────┬─────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────┐
    │         PROTECTED ROUTE HANDLER                        │
    │  • request.user is fully populated:                    │
    │    - sub, email, role, prismaUser, token metadata      │
    │  • Safe to assume user is authenticated + authorized   │
    └───────────────────────────────────────────────────────┘
```

---

## Backend Auth Components

### 1. **JwtStrategy** (`src/modules/auth/jwt.strategy.ts`)

Implements Passport.js JWT strategy for RS256 validation.

**Responsibilities:**

- Extract Bearer token from `Authorization: Bearer <token>` header
- Validate signature using JWKS endpoint from Cognito
- Extract `{ sub, email, cognito:groups, token_use, exp, iat }`
- Resolve Prisma user via `UsersService`
- Return `AuthenticatedPrincipal` with role and linked user

**Environment variables:**

```bash
COGNITO_REGION=us-east-1                              # Cognito region
COGNITO_USER_POOL_ID=us-east-1_ikikne                 # Your pool ID
```

**Example validated payload:**

```typescript
{
  sub: "us-east-1:12345678-1234-1234-1234-123456789012",
  email: "teacher@example.com",
  'cognito:groups': ["TEACHER"],
  token_use: "access",
  iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne",
  exp: 1714689600,
  iat: 1714686000,
}
```

### 2. **UsersService** (`src/modules/auth/users.service.ts`)

Manages user resolution and linking between Cognito and Prisma.

**Methods:**

- `findByCognitoSub(sub)` — Query Prisma by `cognitoSub` (fastest)
- `findByEmail(email)` — Query Prisma by `email`
- `linkCognitoSubToUser(userId, cognitoSub)` — Update user with `cognitoSub`
- `findOrLinkByPayload({ sub, email })` — Smart resolution with auto-linking

**Auto-linking logic:**

1. Try find by `cognitoSub`
2. If not found, try find by `email`
3. If found by email, link the `cognitoSub` automatically
4. Return linked user (or null if neither path matches)

### 3. **JwtAuthGuard** (`src/modules/auth/jwt-auth.guard.ts`)

NestJS guard that applies JWT validation to routes.

**Usage:**

```typescript
@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  @Post()
  async create(@Body() dto: CreateAttemptDto, @Req() req: any) {
    // request.user is now populated with AuthenticatedPrincipal
    console.log(req.user.sub);    // Cognito subject
    console.log(req.user.email);  // User email
    console.log(req.user.role);   // TEACHER | STUDENT | ADMIN
    console.log(req.user.prismaUser); // Prisma user record
  }
}
```

### 4. **RolesGuard** (`src/modules/auth/roles.guard.ts`)

NestJS guard that enforces role-based access control.

**Usage:**

```typescript
@Controller('teacher')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeacherController {
  @Get('alerts')
  @Roles(Role.TEACHER, Role.ADMIN)
  async getAlerts(@Req() req: any) {
    // Only TEACHER or ADMIN can access this
  }

  @Post('assign')
  @Roles(Role.TEACHER)
  async assignPractice(@Body() dto: any) {
    // Only TEACHER can access this
  }
}
```

**Behavior:**

- If user role matches any `@Roles()`, request proceeds
- If user role doesn't match, returns `403 Forbidden`
- If `@Roles()` is not specified, guard allows all authenticated users

### 5. **Roles Enum & Decorator**

```typescript
// src/modules/auth/roles.enum.ts
export enum Role {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN',
}

// src/modules/auth/roles.decorator.ts
@Roles(Role.TEACHER, Role.STUDENT)
```

### 6. **AuthModule** (`src/modules/auth/auth.module.ts`)

Wires everything together via NestJS DI.

```typescript
@Module({
  imports: [DatabaseModule],
  providers: [JwtStrategy, UsersService, RolesGuard],
  exports: [JwtStrategy, UsersService],
})
export class AuthModule {}
```

---

## Client Integration

### General Pattern for All Clients

```
1. User opens app
2. App checks if tokens exist in secure storage (localStorage, Keychain, Shared Preferences)
3. If no tokens, redirect to Cognito login
4. Cognito returns { idToken, accessToken, refreshToken, expiresIn }
5. Store tokens securely
6. For every API call:
   - Extract accessToken
   - Inject into Authorization: Bearer <accessToken> header
   - Make request to backend
7. If token expires (401 response):
   - Call Cognito refresh endpoint to get new accessToken
   - Retry original request
8. On logout:
   - Clear tokens from storage
   - Redirect to login
```

---

### Expo (React Native) Implementation

**Prerequisites:**

- `expo-auth-session` (handles Cognito OAuth flow)
- `@react-native-secure-store/secure-store` (secure token storage)
- `axios` or `fetch` (HTTP client)

**Code Example:**

```typescript
// expo-cognito-client.ts
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import axios, { AxiosInstance } from 'axios';

const COGNITO_DOMAIN = 'innova.auth.us-east-1.amazoncognito.com';
const COGNITO_CLIENT_ID = '1i07jssu59agr1c7hr9aktcnp1';
const COGNITO_REDIRECT_URI = AuthSession.getRedirectUrl();
const API_BASE_URL = 'https://api.superprofes.app';

export class CognitoExpoCli ent {
  private apiClient: AxiosInstance;

  constructor() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
    });

    // Inject Bearer token into every request
    this.apiClient.interceptors.request.use(async (config) => {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle 401 responses (refresh token)
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          const refreshed = await this.refreshToken();
          if (refreshed) {
            return this.apiClient.request(error.config);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  async login(): Promise<boolean> {
    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(
        `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne`,
      );

      const result = await AuthSession.startAsync({
        usePKCE: true,
        discovery,
        clientId: COGNITO_CLIENT_ID,
        redirectUrl: COGNITO_REDIRECT_URI,
        scopes: ['openid', 'email', 'profile'],
      });

      if (result.type === 'success') {
        const { access_token, refresh_token, expires_in } = result.params;

        // Store tokens securely
        await SecureStore.setItemAsync('accessToken', access_token);
        if (refresh_token) {
          await SecureStore.setItemAsync('refreshToken', refresh_token);
        }
        await SecureStore.setItemAsync(
          'expiresAt',
          String(Date.now() + expires_in * 1000),
        );

        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!refreshToken) return false;

      const response = await axios.post(
        `https://${COGNITO_DOMAIN}/oauth2/token`,
        {
          client_id: COGNITO_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const { access_token, expires_in } = response.data;
      await SecureStore.setItemAsync('accessToken', access_token);
      await SecureStore.setItemAsync(
        'expiresAt',
        String(Date.now() + expires_in * 1000),
      );

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('expiresAt');
  }

  // Make authenticated API calls
  async get<T>(path: string): Promise<T> {
    const response = await this.apiClient.get<T>(path);
    return response.data;
  }

  async post<T>(path: string, data: any): Promise<T> {
    const response = await this.apiClient.post<T>(path, data);
    return response.data;
  }
}

// Usage in App.tsx
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const cognitoClient = useRef(new CognitoExpoClient()).current;

  const handleLogin = async () => {
    const success = await cognitoClient.login();
    setIsLoggedIn(success);
  };

  const handleLogout = async () => {
    await cognitoClient.logout();
    setIsLoggedIn(false);
  };

  return (
    <View style={styles.container}>
      {isLoggedIn ? (
        <Button title="Logout" onPress={handleLogout} />
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}
    </View>
  );
}
```

**Key points:**

- Use `expo-secure-store` for token storage (not AsyncStorage)
- Implement request/response interceptors for Bearer injection + refresh
- Handle 401 errors gracefully (token refresh)

---

### Next.js Implementation

**Prerequisites:**

- `next-auth` (optional, but recommended for session management)
- `axios` or `fetch` (HTTP client)
- `js-cookie` or localStorage (token storage)

**Code Example (using custom hooks):**

```typescript
// lib/auth/cognito-next-client.ts
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Inject Bearer token into every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (refresh token)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiClient.request(error.config);
      } else {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

async function refreshAccessToken(): Promise<boolean> {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    const response = await axios.post(
      `https://innova.auth.us-east-1.amazoncognito.com/oauth2/token`,
      {
        client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, expires_in } = response.data;
    localStorage.setItem('accessToken', access_token);
    localStorage.setItem('expiresAt', String(Date.now() + expires_in * 1000));

    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
}

// hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setIsLoggedIn(!!token);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      // Use AWS Cognito SDK or direct API
      const response = await axios.post(
        `https://innova.auth.us-east-1.amazoncognito.com/oauth2/token`,
        {
          client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
          grant_type: 'password',
          username,
          password,
        },
      );

      const { access_token, refresh_token, expires_in } = response.data;
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', refresh_token);
      localStorage.setItem('expiresAt', String(Date.now() + expires_in * 1000));

      setIsLoggedIn(true);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('expiresAt');
    setIsLoggedIn(false);
    router.push('/login');
  };

  return { isLoggedIn, login, logout };
}

// pages/protected-page.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/auth/cognito-next-client';

export default function ProtectedPage() {
  const { isLoggedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.push('/login');
    }
  }, [isLoggedIn]);

  const handleFetchAttempts = async () => {
    try {
      const attempts = await apiClient.get('/attempts');
      console.log('Attempts:', attempts.data);
    } catch (error) {
      console.error('Failed to fetch attempts:', error);
    }
  };

  return (
    <div>
      <h1>Protected Page</h1>
      <button onClick={handleFetchAttempts}>Fetch My Attempts</button>
    </div>
  );
}
```

**Key points:**

- Use localStorage for token storage (or consider `js-cookie` for security)
- Implement axios interceptors for Bearer injection + refresh
- Protect routes with middleware or `useEffect` checks

---

### Astro Implementation

**Prerequisites:**

- `astro` (SSG/SSR framework)
- `@aws-sdk/client-cognito-identity-provider` (optional, for server-side auth)
- `fetch` API (native, no dependencies)

**Code Example:**

```typescript
// src/lib/auth/cognito-astro.ts
interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL;
const COGNITO_DOMAIN = 'innova.auth.us-east-1.amazoncognito.com';
const COGNITO_CLIENT_ID = import.meta.env.PUBLIC_COGNITO_CLIENT_ID;

// Get tokens from localStorage (client-side only)
function getStoredTokens(): Tokens | null {
  if (typeof localStorage === 'undefined') return null;

  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  const expiresAt = localStorage.getItem('expiresAt');

  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: refreshToken || undefined,
    expiresAt: parseInt(expiresAt || '0', 10),
  };
}

// Store tokens to localStorage
function storeTokens(tokens: Tokens) {
  localStorage.setItem('accessToken', tokens.accessToken);
  if (tokens.refreshToken) {
    localStorage.setItem('refreshToken', tokens.refreshToken);
  }
  localStorage.setItem('expiresAt', String(tokens.expiresAt));
}

// Make authenticated API call
export async function apiCall(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const tokens = getStoredTokens();

  if (!tokens) {
    throw new Error('No authentication tokens found');
  }

  // Check if token is expired
  if (Date.now() > tokens.expiresAt) {
    if (!tokens.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }

    const refreshed = await refreshAccessToken(tokens.refreshToken);
    if (!refreshed) {
      throw new Error('Failed to refresh token');
    }
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${getStoredTokens()?.accessToken}`,
  };

  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

async function refreshAccessToken(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: COGNITO_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    storeTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
}

// src/components/LoginForm.astro
---
import { apiCall } from '@/lib/auth/cognito-astro';
---

<form id="login-form">
  <input type="email" id="username" placeholder="Email" required />
  <input type="password" id="password" placeholder="Password" required />
  <button type="submit">Login</button>
</form>

<script>
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = (document.getElementById('username') as HTMLInputElement)
      .value;
    const password = (document.getElementById('password') as HTMLInputElement)
      .value;

    try {
      const response = await fetch(
        'https://innova.auth.us-east-1.amazoncognito.com/oauth2/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: import.meta.env.PUBLIC_COGNITO_CLIENT_ID,
            grant_type: 'password',
            username,
            password,
          }),
        },
      );

      if (!response.ok) {
        alert('Login failed');
        return;
      }

      const data = await response.json();
      localStorage.setItem('accessToken', data.access_token);
      localStorage.setItem('refreshToken', data.refresh_token);
      localStorage.setItem(
        'expiresAt',
        String(Date.now() + data.expires_in * 1000),
      );

      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed');
    }
  });
</script>

// src/pages/protected.astro
---
import { apiCall } from '@/lib/auth/cognito-astro';

// On the server-side, you can validate the user's auth status
// For client-side rendering, the check happens in the component
---

<html>
  <head>
    <title>Protected Page</title>
  </head>
  <body>
    <h1>My Attempts</h1>
    <div id="content">Loading...</div>

    <script>
      (async () => {
        try {
          const { apiCall } = await import('@/lib/auth/cognito-astro');
          const response = await apiCall('/attempts');
          const data = await response.json();

          document.getElementById('content')!.innerHTML = `
            <pre>${JSON.stringify(data, null, 2)}</pre>
          `;
        } catch (error) {
          console.error('Failed to fetch attempts:', error);
          document.getElementById('content')!.innerHTML =
            '<p>Not authenticated</p>';
          window.location.href = '/login';
        }
      })();
    </script>
  </body>
</html>
```

**Key points:**

- Astro runs on the server; guard authentication server-side in dynamic routes
- For static pages, implement client-side auth checks
- Use `import.meta.env` for environment variables
- Implement token refresh in `apiCall` wrapper

---

## Authentication Flows

### Flow 1: Initial Login (New User or First Session)

```
1. User opens app → no tokens in storage
2. App redirects to Cognito login page
3. User enters credentials (email + password)
4. Cognito validates, returns {accessToken, refreshToken, expiresIn}
5. App stores tokens in secure storage
6. App redirects to dashboard
7. Dashboard: request to backend with Bearer token
8. Backend: validates JWT, resolves user, links cognitoSub if needed
9. Dashboard: displays user data
```

**Demo Command:**

```bash
# Use seed data: teacher@innova.demo / password (set via Cognito CLI)
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_ikikne \
  --username teacher@innova.demo \
  --password 'TemporaryPassword123!' \
  --permanent
```

---

### Flow 2: Refresh Token (Token Expiration)

```
1. User makes API request with expired access token
2. Backend returns 401 Unauthorized
3. Client intercepts 401 → calls Cognito refresh endpoint
4. Cognito validates refresh token, returns new access token
5. Client retries original request with new token
6. Backend validates new token, request succeeds
```

**Demo Test:**

```bash
# Wait for token to expire (default: 60 minutes in Cognito)
# Or manually craft an expired JWT and test error handling
```

---

### Flow 3: User Linking on First Login

```
1. User exists in Cognito (email: teacher@example.com, sub: us-east-1:xyz)
2. User exists in Prisma (email: teacher@example.com, cognitoSub: null)
3. User logs in via Cognito, gets access token
4. Client sends Bearer token to backend
5. Backend:
   a. Validates JWT signature
   b. Extracts {sub: "us-east-1:xyz", email: "teacher@example.com"}
   c. Calls UsersService.findOrLinkByPayload()
   d. Finds user by email (cognitoSub is null)
   e. Updates user: cognitoSub = "us-east-1:xyz"
   f. Returns linked user
6. Future logins: find by cognitoSub (faster)
```

**Demo Test:**

```bash
# Run seed to create users
pnpm prisma db seed

# Verify users are linked
pnpm prisma studio
# Or query directly:
SELECT id, email, cognito_sub FROM "User" WHERE email LIKE '%@innova.demo';
```

---

### Flow 4: Role-Based Access Control

```
1. User (STUDENT role) attempts to access /teacher/alerts
2. Backend:
   a. Validates JWT
   b. Resolves user (role = STUDENT)
   c. Checks @Roles(Role.TEACHER) decorator
   d. Role mismatch → returns 403 Forbidden
3. Frontend: displays "Access Denied" or redirects to allowed pages
```

**Demo Test:**

```bash
# Log in as student
curl -H "Authorization: Bearer $STUDENT_TOKEN" \
  https://api.innova.app/teacher/alerts
# Expected: 403 Forbidden

# Log in as teacher
curl -H "Authorization: Bearer $TEACHER_TOKEN" \
  https://api.innova.app/teacher/alerts
# Expected: 200 OK + alert data
```

---

## Error Handling

### Common Error Scenarios

| Scenario | HTTP Status | Backend Response | Client Action |
|----------|------------|------------------|---------------|
| Missing Bearer token | 401 | `{ error: "Unauthorized" }` | Redirect to login |
| Malformed token | 401 | `{ error: "Unauthorized" }` | Clear storage, redirect to login |
| Expired token | 401 | `{ error: "Unauthorized" }` | Refresh token, retry request |
| Invalid signature | 401 | `{ error: "Unauthorized" }` | Token tampered; clear storage |
| Insufficient role | 403 | `{ error: "Forbidden" }` | Display "Access Denied" |
| User not found (new) | 200 | Auto-link triggered | (transparent to client) |

### Implementation in Clients

**Expo (Error Boundary):**

```typescript
try {
  const attempts = await cognitoClient.get('/attempts');
} catch (error) {
  if (error.response?.status === 401) {
    // Token invalid or expired
    await cognitoClient.logout();
    navigation.navigate('Login');
  } else if (error.response?.status === 403) {
    // Role insufficient
    Alert.alert('Access Denied', 'You do not have permission to access this.');
  } else {
    // Other errors
    Alert.alert('Error', 'Something went wrong.');
  }
}
```

**Next.js (Error Boundary):**

```typescript
try {
  const response = await apiClient.get('/attempts');
} catch (error) {
  if (error.response?.status === 401) {
    localStorage.clear();
    router.push('/login');
  } else if (error.response?.status === 403) {
    router.push('/access-denied');
  }
}
```

---

## Security & Best Practices

### ✅ What the Backend Does

1. **Validates JWT signature** using Cognito's JWKS endpoint
2. **Checks token expiration** (exp claim)
3. **Verifies issuer** (iss claim matches Cognito endpoint)
4. **Enforces role-based access control** via @Roles() decorator
5. **Logs authentication events** with trace IDs (no PII)
6. **Returns 401/403** for invalid or insufficient auth

### ✅ What Clients Must Do

1. **Store tokens securely:**
   - Expo: Use `SecureStore` (Keychain/Shared Preferences)
   - Next.js: Use `js-cookie` with `Secure` + `HttpOnly` flags (requires backend cookie middleware)
   - Astro: Use localStorage only if no sensitive data; prefer server-side rendering

2. **Inject Bearer token into all API requests:**

   ```
   Authorization: Bearer <accessToken>
   ```

3. **Implement automatic token refresh:**
   - On 401 response, call Cognito refresh endpoint
   - Update stored access token
   - Retry original request

4. **Clear tokens on logout:**

   ```typescript
   await SecureStore.deleteItemAsync('accessToken');
   await SecureStore.deleteItemAsync('refreshToken');
   ```

5. **Handle token expiration gracefully:**
   - Never hardcode token logic; implement interceptors
   - Handle clock skew (server/client time differences)

6. **Never expose tokens in URLs or logs:**

   ```typescript
   // ❌ WRONG
   window.location.href = `/dashboard?token=${accessToken}`;

   // ✅ RIGHT
   localStorage.setItem('accessToken', accessToken);
   window.location.href = '/dashboard';
   ```

### 🔒 Security Checklist

- [ ] Cognito user pool configured with strong password policy
- [ ] MFA enabled for teachers/admins (optional in MVP)
- [ ] HTTPS enforced for all API endpoints
- [ ] CORS properly configured (backend `AllowedOrigins`)
- [ ] CSRF protection enabled (if using cookies)
- [ ] Tokens do NOT contain PII (checked in JWKS payload)
- [ ] Log rotation enabled (no sensitive logs retained >30 days)
- [ ] Secrets stored in AWS Secrets Manager (never in code)

---

## Demo Setup

### 1. Run Seed Script

```bash
cd innova-backend-serverless

# Start local database
pnpm docker compose up -d

# Wait for Postgres to be ready (~30s)
pnpm docker compose logs postgres

# Run seed
pnpm prisma db seed

# Expected output:
# ✅ Teacher: seed-teacher-001 (cognitoSub: us-east-1:00000000-0000-0000-0000-000000000001)
# ✅ 5 Students created with cognitoSub linking
# 🎉 Seed complete!
```

### 2. Run Auth Tests

```bash
# Unit tests
pnpm test -- src/modules/auth/__tests__/jwt.strategy.spec.ts
pnpm test -- src/modules/auth/__tests__/users.service.spec.ts

# E2E tests
pnpm test:e2e -- src/modules/auth/__tests__/auth.e2e-spec.ts

# Coverage
pnpm test:cov -- src/modules/auth
```

### 3. Demo Users for Testing

| Email | Password | Role | Cognito Sub |
|-------|----------|------|-------------|
| `teacher@innova.demo` | `TemporaryPassword123!` | TEACHER | `us-east-1:00000000-0000-0000-0000-000000000001` |
| `student1@innova.demo` | `TemporaryPassword123!` | STUDENT | `us-east-1:00000000-0000-0000-0000-000000000011` |
| `student2@innova.demo` | `TemporaryPassword123!` | STUDENT | `us-east-1:00000000-0000-0000-0000-000000000012` |

**Set passwords in Cognito:**

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_ikikne \
  --username teacher@innova.demo \
  --password 'TemporaryPassword123!' \
  --permanent
```

### 4. Test Flow

**Step 1: Login**

```bash
curl -X POST https://innova.auth.us-east-1.amazoncognito.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=1i07jssu59agr1c7hr9aktcnp1&grant_type=password&username=teacher@innova.demo&password=TemporaryPassword123!"

# Response:
# {
#   "access_token": "eyJhbGc...",
#   "refresh_token": "...",
#   "expires_in": 3600,
#   "token_type": "Bearer"
# }
```

**Step 2: Use Token**

```bash
TOKEN="<access_token_from_step_1>"

# Protected route (should succeed)
curl -H "Authorization: Bearer $TOKEN" \
  https://api.innova.app/items

# Teacher-only route (teacher should succeed)
curl -H "Authorization: Bearer $TOKEN" \
  https://api.innova.app/teacher/alerts

# Without token (should fail with 401)
curl https://api.innova.app/items
# Expected: 401 Unauthorized
```

---

## Troubleshooting

### Issue: "Invalid JWT signature"

**Cause:** JWKS endpoint is unreachable or returning wrong keys  
**Solution:** Verify Cognito pool ID and region in environment variables

### Issue: "User not found after login"

**Cause:** User exists in Cognito but not in Prisma  
**Solution:** Seed runs and auto-links on first login; check Prisma logs

### Issue: "403 Forbidden on protected route"

**Cause:** User role doesn't match @Roles() decorator  
**Solution:** Verify user's Cognito group assignment and role extraction

### Issue: "Token refresh fails"

**Cause:** Refresh token expired (default 5 days) or invalid  
**Solution:** Force user to log in again; implement refresh token rotation

---

## Next Steps

1. **Client SDKs:** Generate TypeScript API client from OpenAPI schema (`/docs/openapi.json`)
2. **Password Recovery:** Clients call Cognito `ForgotPassword` API (backend validates after reset)
3. **MFA:** Implement TOTP challenge in Cognito (optional for MVP)
4. **Session Revocation:** Implement token blacklist for force logout (Cognito doesn't support instant revocation)
5. **Admin Panel:** Create admin endpoints for user management (guarded with `@Roles(Role.ADMIN)`)

---

**Questions?** Refer to the [Cognito Developer Guide](https://docs.aws.amazon.com/cognito) or the backend source code in `src/modules/auth/`.
