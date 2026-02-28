# 스마트빌 회계 워크플로우 자동화 시스템

스마트빌(SmartBill) 전자세금계산서 발행 플랫폼을 대상으로 하는 B2B SaaS 회계 자동화 시스템.
반복적인 세금계산서 발행·인증서 관리 업무를 비동기 큐 기반으로 완전 자동화한다.

---

## 목차

- [시스템 개요](#시스템-개요)
- [기술 스택](#기술-스택)
- [아키텍처](#아키텍처)
- [디렉토리 구조](#디렉토리-구조)
- [시작하기](#시작하기)
  - [사전 요구사항](#사전-요구사항)
  - [환경변수 설정](#환경변수-설정)
  - [Docker로 전체 스택 구동](#docker로-전체-스택-구동)
  - [로컬 개발 환경](#로컬-개발-환경)
- [DB 마이그레이션](#db-마이그레이션)
- [API 레퍼런스](#api-레퍼런스)
- [E2E 검증 플로우](#e2e-검증-플로우)
- [핵심 설계 결정](#핵심-설계-결정)
- [Phase 2 로드맵](#phase-2-로드맵)

---

## 시스템 개요

단편적인 매크로 스크립트의 불안정성을 극복하고, 다수의 기업 고객(테넌트)을 수용할 수 있는 엔터프라이즈 B2B SaaS 구조를 처음부터 구축한다.

**핵심 기능 (Phase 1 MVP):**

- 테넌트별 완전 격리된 멀티테넌트 데이터 모델 (Schema-per-Tenant)
- 세금계산서 발행 작업의 비동기 큐 처리 (HTTP 타임아웃 방지)
- 공동인증서 등록·동기화 자동화
- 지수 백오프 기반 자동 재시도 (스마트빌 일시 장애 대응)
- 작업별 격리된 Playwright 브라우저 컨텍스트 (보안 + 메모리 누수 방지)
- Pino JSON 구조화 로그 (운영 가시성)

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 런타임 | Node.js 20 + TypeScript 5 |
| API 서버 | Express.js 4 |
| 큐 시스템 | Redis 7 + BullMQ 5 |
| 데이터베이스 | PostgreSQL 16 (schema-per-tenant) |
| 브라우저 자동화 | Playwright 1.44 (Chromium only) |
| 컨테이너화 | Docker + docker-compose |
| 로깅 | Pino (JSON 구조화) |
| 패키지 매니저 | pnpm (monorepo workspace) |
| 인증 | JWT (jsonwebtoken) |
| 유효성 검증 | Zod |

---

## 아키텍처

```
클라이언트
    │
    ▼ HTTP REST
┌─────────────────────────────────────┐
│            API 서버 (port 3000)      │
│  interfaces/ → application/ → infra │
│  Express + JWT + Zod                │
└──────────────┬──────────────────────┘
               │ BullMQ.add()
               ▼
┌──────────────────────────┐
│   Redis 7 (큐 브로커)     │
│  smartbill:invoice-issue  │
│  smartbill:certificate-sync│
└──────────────┬───────────┘
               │ BullMQ.Worker
               ▼
┌─────────────────────────────────────┐
│          Worker 서버 (별도 컨테이너)  │
│  BullMQ Consumer                    │
│  └─ Playwright (Chromium)           │
│       └─ Page Object Model          │
│            ├─ SmartBillLoginPage    │
│            ├─ CertificatePage       │
│            └─ InvoiceIssuePage      │
└──────────────┬──────────────────────┘
               │ pg.Pool
               ▼
┌──────────────────────────────────────┐
│         PostgreSQL 16                │
│  public.tenants / public.users       │
│  tenant_{id}.accounts                │
│  tenant_{id}.certificates            │
│  tenant_{id}.transactions            │
│  tenant_{id}.jobs                    │
└──────────────────────────────────────┘
```

**멀티테넌트 격리 패턴:**

```
JWT 수신 → tenantId 추출 → SET search_path TO tenant_{id}, public
```

각 테넌트의 데이터는 독립된 PostgreSQL 스키마에 저장되어 쿼리 레벨에서 완전히 격리된다.

---

## 디렉토리 구조

```
smartvill/
├── docker-compose.yml          # 전체 스택 오케스트레이션
├── .env.example                # 환경변수 템플릿
├── pnpm-workspace.yaml         # pnpm monorepo 설정
├── package.json                # 루트 개발 스크립트
│
├── packages/
│   ├── api/                    # API 서버 컨테이너
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts                         # 엔트리포인트
│   │       ├── infrastructure/
│   │       │   ├── database.ts                 # pg.Pool + getTenantClient()
│   │       │   ├── redis.ts                    # ioredis 클라이언트
│   │       │   ├── server.ts                   # Express + helmet + pino-http
│   │       │   └── bullmq.ts                   # Queue 인스턴스 (Producer)
│   │       ├── interfaces/http/
│   │       │   ├── routes/
│   │       │   │   ├── index.ts                # 라우터 등록 + 에러 핸들러
│   │       │   │   ├── authRoutes.ts
│   │       │   │   ├── tenantRoutes.ts
│   │       │   │   └── jobRoutes.ts
│   │       │   ├── controllers/
│   │       │   │   ├── authController.ts
│   │       │   │   ├── tenantController.ts     # 테넌트 생성 + 스키마 프로비저닝
│   │       │   │   └── jobController.ts
│   │       │   └── middlewares/
│   │       │       ├── authenticate.ts         # JWT 검증 + tenantId 주입
│   │       │       └── setTenantContext.ts     # 테넌트 활성화 검증
│   │       ├── application/use-cases/
│   │       │   ├── QueueInvoiceIssuanceUseCase.ts
│   │       │   ├── QueueCertificateSyncUseCase.ts
│   │       │   └── GetJobStatusUseCase.ts
│   │       └── domain/models/
│   │           ├── Tenant.ts
│   │           ├── Job.ts
│   │           └── Certificate.ts
│   │
│   └── worker/                 # 워커 컨테이너 (Playwright 포함)
│       ├── Dockerfile          # playwright:v1.44.0-jammy 기반, Chromium only
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts                         # 워커 엔트리포인트
│           ├── infrastructure/
│           │   ├── database.ts                 # Worker용 pg.Pool
│           │   └── redis.ts                    # BullMQ 전용 Redis 연결
│           ├── workers/
│           │   ├── invoiceWorker.ts            # BullMQ Consumer (발행, concurrency=2)
│           │   └── certificateWorker.ts        # BullMQ Consumer (인증서, concurrency=1)
│           └── automation/playwright/
│               ├── browser.ts                  # BrowserSession 생성/해제 유틸
│               └── pages/
│                   ├── SmartBillLoginPage.ts   # 로그인 POM (ID/PW + 인증서)
│                   ├── CertificatePage.ts      # 인증서 조회·등록 POM
│                   └── InvoiceIssuePage.ts     # 세금계산서 발행 POM
│
└── scripts/
    └── db-migrate.ts           # public 스키마 마이그레이션 (멱등성 보장)
```

---

## 시작하기

### 사전 요구사항

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- [Node.js 20+](https://nodejs.org/) (로컬 개발 시)
- [pnpm](https://pnpm.io/) (로컬 개발 시)

> **Windows 사용자:** Docker를 WSL2 백엔드로 설정하고, 프로젝트 소스를 WSL2 내부 파일 시스템(`/home/...`)에 위치시켜야 Cross-OS 마운트 오버헤드 없이 최적 성능을 얻을 수 있다.

### 환경변수 설정

```bash
cp .env.example .env
```

`.env` 주요 항목:

```env
# JWT
JWT_SECRET=256비트-이상의-랜덤-시크릿-값으로-반드시-변경

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_USER=smartvill
POSTGRES_PASSWORD=smartvill_password
POSTGRES_DB=smartvill

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# SmartBill 대상 URL
SMARTBILL_BASE_URL=https://www.smartbill.co.kr
```

### Docker로 전체 스택 구동

```bash
# 1. 전체 스택 빌드 + 구동
docker-compose up -d

# 2. 서비스 상태 확인
docker-compose ps

# 3. DB 마이그레이션 실행 (최초 1회)
pnpm db:migrate

# 4. 로그 모니터링
docker-compose logs -f api worker
```

**구동되는 서비스:**

| 서비스 | 포트 | 역할 |
|--------|------|------|
| `api` | 3000 | Express API 서버 |
| `worker` | - | Playwright 워커 (포트 없음) |
| `postgres` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 |

### 로컬 개발 환경

```bash
# 의존성 설치
pnpm install

# 인프라만 Docker로 구동
docker-compose up -d postgres redis

# API 서버 개발 모드 (hot-reload)
pnpm dev:api

# Worker 개발 모드 (별도 터미널)
pnpm dev:worker
```

---

## DB 마이그레이션

마이그레이션 스크립트는 멱등성이 보장되므로 여러 번 실행해도 안전하다.

```bash
pnpm db:migrate
```

**생성되는 public 스키마 테이블:**

| 테이블 | 설명 |
|--------|------|
| `public.tenants` | 글로벌 테넌트 레지스트리 |
| `public.users` | 테넌트별 관리자 계정 |
| `public.schema_migrations` | 마이그레이션 이력 |

**테넌트 온보딩 시 자동 생성 (`tenant_{id}` 스키마):**

| 테이블 | 설명 |
|--------|------|
| `accounts` | 스마트빌 연동 계정 정보 |
| `certificates` | 공동인증서 메타데이터 |
| `transactions` | 세금계산서 발행 이력 |
| `jobs` | 큐 작업 추적 |

---

## API 레퍼런스

### 인증 없이 호출 가능

#### 테넌트 등록

```http
POST /api/tenants
Content-Type: application/json

{
  "name": "테스트 주식회사",
  "businessNumber": "1234567890",
  "email": "admin@test.com",
  "adminPassword": "password123"
}
```

응답 `201 Created`:
```json
{
  "tenantId": "a1b2c3d4...",
  "schemaName": "tenant_a1b2c3d4...",
  "message": "Tenant created successfully"
}
```

#### 로그인 (JWT 발급)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@test.com",
  "password": "password123"
}
```

응답 `200 OK`:
```json
{
  "token": "eyJhbGci...",
  "tenantId": "a1b2c3d4..."
}
```

---

### 인증 필요 (Authorization: Bearer {token})

#### 세금계산서 발행 큐 등록

```http
POST /api/jobs/invoice-issue
Authorization: Bearer {token}
Content-Type: application/json

{
  "accountId": "uuid-of-account",
  "invoiceData": {
    "buyerBusinessNumber": "9876543210",
    "buyerName": "공급받는자 회사명",
    "buyerEmail": "buyer@example.com",
    "supplyAmount": 100000,
    "taxAmount": 10000,
    "totalAmount": 110000,
    "itemName": "소프트웨어 개발 용역",
    "issueDate": "2026-02-28"
  }
}
```

응답 `202 Accepted`:
```json
{
  "jobId": "invoice-a1b2c3-1709123456789",
  "status": "waiting",
  "message": "Invoice issuance job queued successfully"
}
```

#### 인증서 동기화 큐 등록

```http
POST /api/jobs/certificate-sync
Authorization: Bearer {token}
Content-Type: application/json

{
  "accountId": "uuid-of-account",
  "certificatePath": "/path/to/cert.pfx",
  "certificatePassword": "cert-password"
}
```

응답 `202 Accepted`:
```json
{
  "jobId": "cert-a1b2c3-1709123456789",
  "status": "waiting",
  "message": "Certificate sync job queued successfully"
}
```

#### 작업 상태 조회

```http
GET /api/jobs/{jobId}/status?type=invoice-issue
Authorization: Bearer {token}
```

응답 `200 OK`:
```json
{
  "jobId": "invoice-a1b2c3-1709123456789",
  "type": "invoice-issue",
  "status": "completed",
  "progress": 100,
  "attempts": 1,
  "returnValue": { "success": true, "invoiceNumber": "202602280001" },
  "createdAt": "2026-02-28T10:00:00.000Z",
  "processedAt": "2026-02-28T10:00:05.000Z",
  "finishedAt": "2026-02-28T10:00:30.000Z"
}
```

**작업 상태값:** `waiting` → `active` → `completed` / `failed` / `delayed`

#### 헬스체크

```http
GET /health
```

---

## E2E 검증 플로우

```bash
# 1. 스택 구동 확인
curl http://localhost:3000/health

# 2. 테넌트 생성
curl -s -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "테스트회사",
    "businessNumber": "1234567890",
    "email": "admin@test.com",
    "adminPassword": "password123"
  }' | jq .

# 3. 로그인 → JWT 획득
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}' \
  | jq -r .token)

# 4. 세금계산서 발행 작업 등록
JOB_ID=$(curl -s -X POST http://localhost:3000/api/jobs/invoice-issue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "YOUR_ACCOUNT_UUID",
    "invoiceData": {
      "buyerBusinessNumber": "9876543210",
      "buyerName": "구매자 회사",
      "buyerEmail": "buyer@example.com",
      "supplyAmount": 100000,
      "taxAmount": 10000,
      "totalAmount": 110000,
      "itemName": "서비스 이용료",
      "issueDate": "2026-02-28"
    }
  }' | jq -r .jobId)

echo "Job ID: $JOB_ID"

# 5. Redis 큐 삽입 확인
docker exec smartvill-redis redis-cli KEYS "bullmq:*"

# 6. 작업 상태 폴링
curl -s "http://localhost:3000/api/jobs/$JOB_ID/status?type=invoice-issue" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 7. Worker 로그 확인 (Playwright 실행 흐름)
docker-compose logs worker

# 8. PostgreSQL 결과 확인
docker exec smartvill-postgres psql -U smartvill -d smartvill \
  -c "SELECT * FROM tenant_YOUR_TENANT_ID.transactions LIMIT 5;"
```

---

## 핵심 설계 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 멀티테넌트 전략 | Schema-per-Tenant | 재무 데이터 격리 필수. RLS는 애플리케이션 버그 하나로 타 테넌트 데이터가 노출될 위험이 있음 |
| 브라우저 | Chromium only | 이미지 크기 최소화, 보안 공격 표면 축소 |
| 큐 재시도 | 지수 백오프 5회 (초기 1분) | 스마트빌 일시적 장애(점검, 네트워크 오류) 자동 복구 |
| API-Worker 분리 | 별도 컨테이너 | HTTP 타임아웃 방지, 독립적 수평 확장, 메모리 폭증 격리 |
| 브라우저 격리 | 작업별 BrowserContext | 쿠키·세션 교차 오염 방지, 메모리 누수 차단 (`finally` 강제 종료) |
| 리소스 차단 | 이미지·광고 스크립트 route.abort() | 자동화 속도 향상, 외부 의존성 실패 방지 |
| 패스워드 해싱 | SHA-256 (현재) | MVP 수준. 프로덕션 전 bcrypt/argon2 로 교체 필요 |

---

## BullMQ 큐 설정

```typescript
// 재시도 정책 (packages/api/src/infrastructure/bullmq.ts)
{
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 60_000,  // 1분 → 2분 → 4분 → 8분 → 16분
  },
  removeOnComplete: false,  // 완료된 작업 보존 (감사 목적)
  removeOnFail: false,      // 실패 작업 보존 (디버깅 목적)
}
```

**큐 이름:**
- `smartbill:invoice-issue` — 세금계산서 발행 (concurrency: 2)
- `smartbill:certificate-sync` — 인증서 동기화 (concurrency: 1)

---

## Phase 2 로드맵

Phase 1 MVP가 안정화되면 다음 기능을 추가한다:

| 기능 | 설명 |
|------|------|
| AI 오류 분류 | 실패 텔레메트리(DOM 스냅샷, 스크린샷, 스택 트레이스)를 LLM으로 분석하여 오류 유형 자동 분류 |
| Self-healing 로케이터 | UI 변경으로 로케이터가 깨질 경우 AI가 새로운 CSS Selector를 추론하여 자동 복구 |
| 회계 데이터 분석 | 발행 이력 기반 비용 분류, 이상 지출 탐지, VAT 컴플라이언스 검증 |
| WebSocket 상태 알림 | 폴링 방식 대신 실시간 작업 상태 푸시 |
| BullMQ 스케줄러 | 주기적 세금계산서 상태 동기화, 야간 데이터 정리 크론 작업 |
| 관측성 강화 | ELK 스택 또는 Datadog 연동, 커스텀 메트릭 대시보드 |
