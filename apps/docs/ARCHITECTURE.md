# System Architecture

## Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js + Express (TypeScript) |
| ORM | Prisma (PostgreSQL) |
| Frontend | Next.js 14+ (App Router, TypeScript) |
| Process Manager | PM2 — cluster mode |
| AI (explanations) | OpenAI GPT-4.1-mini / GPT-4.1 |
| TTS | Azure Cognitive Services (Speech SDK via REST) |
| STT | Azure Cognitive Services (Speech-to-Text REST) |
| Cache / Locks | Redis (ioredis) |
| Audio Storage | Local filesystem (`/opt/exam/audio/`) |

---

## PM2 Cluster Mode

Both API and Web are managed by PM2 in cluster mode.

- Multiple worker processes share the same port via the OS load balancer.
- State must **not** be stored in process memory — use Redis or DB.
- Race conditions (e.g., double TTS generation) are prevented via Redis distributed locks.

```
pm2 list
# Shows: api (cluster, N instances), web (cluster, N instances)
```

Config: `apps/api/ecosystem.config.js`, `apps/web/ecosystem.config.js`

---

## Redis

Redis is used for:

| Purpose | Key pattern | TTL |
|---------|-------------|-----|
| AI explanation cache | `question:{id}:explanation` | 1 hour |
| Explanation generation lock | `lock:question:{id}` | 30 s |
| TTS generation lock | `lock:tts:{questionId}:{lang}` | 60 s |
| Oral exam session timer | `oral:session:{sessionId}:expires` | 10 min |
| Oral exam rate limit | `rate:oral:user:{userId}` | until midnight |

**Graceful fallback:** If Redis is unavailable, the system falls back to DB-only
checks (no locking) and never crashes.

Environment variable: `REDIS_URL` (default: `redis://localhost:6379`)

Code: `apps/api/src/lib/redis.ts`

---

## OpenAI Integration

Two separate use-cases:

### 1. Ziyoda — Test Question Explanations

- File: `apps/api/src/modules/ai/ziyoda.generator.ts`
- File: `apps/api/src/modules/ai/ziyoda-llm.client.ts` (shared singleton)
- Model: `gpt-4.1-mini`
- Purpose: Cached explanation per question per language
- Cache: DB (`QuestionAIExplanation`) + Redis

### 2. Oral Answer Generation

- File: `apps/api/src/modules/ai/oralAnswer.generator.ts`
- Model: `gpt-4.1-mini`
- Purpose: Generate reference answer HTML for oral exam questions
- Cache: DB (`OralAnswer`, `DirectionOralAnswer`)

### 3. TTS Speech Script

- File: `apps/api/src/modules/tts/ai.speech.generator.ts`
- Model: `gpt-4.1-mini`, temperature 0.7
- Purpose: Rewrite explanation as academic lecture speech (for Azure TTS)
- Language detection: Cyrillic → Russian, Latin → Uzbek (deterministic)
- Fallback: If LLM fails, use raw explanation text

### 4. Oral Exam Evaluator

- File: `apps/api/src/modules/oral-session/oral.evaluator.ts`
- Model: `gpt-4.1`, temperature 0.2
- Purpose: Evaluate student transcript vs. reference answer
- Returns: `{ score, coverage[], missedPoints[], summary }`

Environment variable: `OPENAI_API_KEY`

---

## Azure TTS Integration

- File: `apps/api/src/modules/tts/azure.tts.ts`
- API: Azure Cognitive Services TTS REST (`tts.speech.microsoft.com`)
- Output: WAV audio files stored in `/opt/exam/audio/`
- SSML: Academic Lecture Voice Engine
  - Female voices: `ru-RU-SvetlanaNeural` / `uz-UZ-MadinaNeural`
  - Style: `teacher`, styledegree 1.9
  - Prosody: `rate="+3%"`, `pitch="+2%"`
- Settings: DB (`TtsSettings`) — enabled, voiceRu, voiceUz, rate, pauseMs
- Chunking: max 3200 chars/request, WAV buffers concatenated

Environment variables: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`

---

## Azure STT Integration

- File: `apps/api/src/modules/oral-session/azure.stt.ts`
- API: Azure Speech-to-Text REST (`stt.speech.microsoft.com`)
- Usage: Oral exam session — transcribe student's recorded audio answer
- Languages: `ru-RU` / `uz-UZ`

Environment variables: same `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`

---

## Oral Exam Session System

The timed oral exam (separate from the study browsing mode):

```
POST /oral-session/start   → create session, pick 5 questions, start Redis timer
POST /oral-session/answer  → upload audio → Azure STT → GPT eval → save score
POST /oral-session/finish  → sum scores, mark session finished
GET  /oral-session/:id/status → ttl, answeredCount
```

- Access: **Active subscribers only** + admins
- Rate limit: **1 session per day per user** (Redis)
- Timer: **10 minutes** (Redis TTL)
- Pass threshold: **30 / 50 points**
- DB models: `OralExamSession`, `OralExamAnswer`

---

## Database

PostgreSQL managed via Prisma ORM.

Key models:

| Model | Purpose |
|-------|---------|
| `Exam` | Exam catalog (TEST/ORAL, RU/UZ) |
| `Question` | Questions with oral/test types |
| `OralAnswer` | Pre-generated AI answer per question |
| `DirectionOralAnswer` | Shared answer for same direction+language |
| `OralAccessLog` | Daily browsing slot tracking |
| `OralExamSession` | Timed oral exam session |
| `OralExamAnswer` | Per-question scored answer in session |
| `QuestionAIExplanation` | Cached Ziyoda explanation |
| `QuestionAudio` | Cached TTS audio path |
| `QuestionAudioScript` | Cached TTS script (with hash) |
| `TtsSettings` | Azure TTS config (voice, rate, enabled) |
| `UserSubscription` | Subscription records |
| `OneTimeAccess` | One-time exam access |

---

## Release Deployment Strategy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full details.

```
/opt/exam/
├── releases/           ← one folder per deploy
├── current -> symlink  ← pm2 reads from here
└── deploy.sh           ← single deploy command
```
