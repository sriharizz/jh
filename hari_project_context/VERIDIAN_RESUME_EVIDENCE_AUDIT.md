# VERIDIAN WORKOS — RESUME EVIDENCE & AI ENGINEER INTERVIEW AUDIT
**Canonical Source of Truth & Technical Deep-Dive**  
**Audited Repository:** `c:\projects\verdian` (`sriharizz/veridian`)  
**Target Roles:** AI Engineer | Generative AI Engineer | Agentic AI Engineer | ML/AI Systems Engineer | AI Automation Engineer  
**Audit Standard:** Strict Codebase Ground-Truth. No invented metrics, synthetic users, or phantom deployments.

---

## IMPLEMENTATION STATUS TAXONOMY

To guarantee 100% interview defensibility, every component in this audit is classified under one of the following verified states:

- `[IMPLEMENTED + TESTED]`: Code exists in repository and verified via built-in test harness/smoke script.
- `[IMPLEMENTED]`: Code exists, is fully wired, syntactically complete, and integrated into the pipeline.
- `[IMPLEMENTED BUT NOT MEASURED]`: Architectural pattern is functioning in code, but no quantitative performance/latency benchmark exists in repository.
- `[DESIGNED BUT NOT IMPLEMENTED]`: Documented in architectural specifications/comments/README but stubbed or missing concrete implementation in source files.
- `[PROPOSED/FUTURE]`: Production hardening path documented for enterprise migration.
- `[NOT VERIFIED FROM CODEBASE]`: Claim cannot be substantiated by static code analysis or commit history.

---

# 1. PROJECT OVERVIEW

### Problem Statement
Modern enterprise product and engineering teams spend 8–12 hours per manager per week manually converting unstructured meeting discussions into tracked, compliant tasks across project management and communication tools. Existing meeting transcription tools (Otter.ai, Fireflies, basic LLM wrappers) suffer from the **"Read-Only Gap"**: they produce passive summaries and transcriptions but fail to execute work, validate policies, or interface with enterprise databases and ticketing platforms.

### Target User
Engineering Managers (EMs), Product Managers (PMs), Technical Leads, and Operations Directors who run recurring synchronisation meetings (e.g., release kickoffs, sprint planning, cross-functional syncs) and must enforce enterprise compliance, budget, HR availability, and capacity constraints before delegating work.

### Inputs & Outputs
- **Inputs:** Raw meeting transcript text payloads (`POST /api/meeting-ended` with `meeting_id` and `transcript`).
- **Outputs:**
  1. Structured meeting context (TL;DR bullets, attendees, timestamp, key decisions ledger).
  2. Policy-checked, capacity-verified, and reframed task items.
  3. Live Atlassian Jira Task issues (`POST /rest/api/3/issue`) tagged with provenance labels (`veridian-auto`, `meeting-extracted`).
  4. Contextual Slack Direct Messages to assignees containing Jira ticket URLs and verbatim transcript provenance quotes.
  5. Executive channel meeting summaries posted to `#product-team`.
  6. Real-time Server-Sent Events (`GET /api/stream/{thread_id}`) driving a 4-panel Next.js 14 dashboard.

### Why AI Was Essential
1. **Unstructured to Structured Entity Extraction:** Resolving conversational spoken dialogue without formal speaker labels into structured Pydantic schemas (`ExtractionOutput`, `TaskExtraction`, `DiscussionFlag`, `DecisionExtraction`).
2. **Semantic Vector Search (RAG):** Matching informal compute requests or architectural changes against unstructured PDF policy chunks (`security_policies`) and budget rows (`finance_budgets`) using 1024-dimensional embeddings where keyword search fails.
3. **Complex Policy Reframing & Remediation:** Translating policy breaches into compliant task descriptions (e.g., converting "Deploy Elasticsearch directly to production" into a compliant 14-day staging quarantine deployment plan under `SEC-POL-089`).
4. **Intent Disambiguation in Async Loops:** Classifying informal human Slack replies (e.g., "almost done", "blocked by IAM permissions") into deterministic finite states (`COMPLETED`, `BLOCKED`, `AMBIGUOUS`) with calibrated confidence scores.

### Why Workflow Orchestration (LangGraph) Was Essential
- Meeting processing is non-linear and requires stateful execution: idempotency checks, parallel fan-out firewall evaluation across 4 distinct data silos, fan-in state reconciliation via custom reducers, conditional dynamic auto-routing, checkpointer-backed Human-in-the-Loop (HITL) interrupt/resumption, and external dispatching.
- Simple sequential LLM chains cannot support parallel graph execution with deep-merging reducers or durable state suspension across asynchronous webhooks.

### What Makes It Different From a Basic LLM Chatbot
A basic LLM chatbot takes a prompt, generates text in a single inference call, and loses state. Veridian is an **Enterprise Agentic Operating System**:
- It validates LLM extractions against live enterprise databases (Supabase pgvector, Jira API, BambooHR data).
- It executes physical actions in third-party enterprise tools (Jira, Slack).
- It suspends execution using deterministic checkpointers for human approval.
- It operates an autonomous secondary asynchronous feedback loop (Graph B) to track and close tasks based on webhooks.

### Concise End-to-End Flow
```
INPUT: Raw Transcript Payload (POST /api/meeting-ended)
   │
   ▼
PHASE 1: AI Processing & Ingestion
   ├─ Ingest Node (Supabase processed_meetings idempotency check)
   └─ Extractor Node (Gemini 2.5 Flash / 1M context with Pydantic structured output)
   │
   ▼
PHASE 2: Agentic Firewall Fan-Out (Parallel Checks)
   ├─ HR Checker (Supabase hr_employees SQL status lookup)
   ├─ Finance Checker (Nvidia 1024-dim pgvector cosine similarity vs finance_budgets)
   ├─ Security Checker (Nvidia 1024-dim pgvector cosine similarity vs security_policies)
   └─ Capacity Checker (Live Atlassian Jira API JQL open-ticket count)
   │
   ▼
PHASE 2.5: Auto-Routing & AI Resolution
   ├─ Auto-Router Node (Conditionally reassigns overloaded/unavailable assignees)
   ├─ Merge Node (Fan-in barrier with update_tasks_reducer + audit_trail log)
   └─ Resolution Generator Node (Nvidia Llama 3.1 70B Pydantic remediation generator)
   │
   ▼
PHASE 3: Human-in-the-Loop (HITL) Gate
   ├─ HITL Interrupt Node (Pauses graph execution via interrupt(), checkpoints state)
   └─ SSE Stream (Pushes state to Next.js 4-panel Approvals UI for manager review)
   │
   ▼
PHASE 4: External Tools / Dispatching (POST /api/hitl-resume)
   ├─ State Update Node (Mutates tasks based on manager approval payload)
   └─ Dispatcher Node (Live Atlassian Jira ticket creation + Slack DMs + Summary)
   │
   ▼
OUTPUT: Live Jira Tickets + Slack Notifications + Next.js Real-Time Tracker UI
```

---

# 2. MY EXACT CONTRIBUTION

### Git History & Repository Evidence
- **Single Committer:** Commit `0f6d1b27b53a07477e67f3760e3cbe09969292f8`
- **Author:** `Hari <sriharizbett@gmail.com>`
- **Scope:** Full-stack architecture, dual-graph LangGraph orchestration, FastAPI SSE backend, Supabase pgvector migrations, data connectors, and Next.js 14 frontend.

### Detailed Engineering Contribution Breakdown

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Dual-Graph LangGraph Orchestration (Graph A & Graph B)                             │
│ WHAT I BUILT: Designed and implemented Graph A (12-node meeting pipeline with parallel fan-out,   │
│               HITL pause/resume) and Graph B (5-node async Slack/GitHub event tracker).          │
│ WHY: Meeting processing requires parallel data checking and durable execution halts, while       │
│      post-meeting tracking requires an event-driven loop with loop guardrails.                   │
│ FILE: backend/agent/graph_a.py, backend/agent/graph_b.py                                         │
│ FUNCTION/CLASS: build_graph_a(), build_graph_b(), build_graph_b_github()                         │
│ EVIDENCE: StateGraph instantiation, conditional edge routers, checkpointer integration.          │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Parallel-Safe State Reducer for Concurrent Fan-Out                                 │
│ WHAT I BUILT: Custom dictionary reducer `update_tasks_reducer` using deep field-level merging    │
│               for LangGraph's Annotated state dictionary.                                        │
│ WHY: Standard LangGraph fan-in overwrites sibling branch writes. The 4 checker nodes write to    │
│      the same task dictionary concurrently without destroying non-overlapping fields.            │
│ FILE: backend/agent/state.py                                                                     │
│ FUNCTION/CLASS: update_tasks_reducer(), AgentState TypedDict                                     │
│ EVIDENCE: Lines 122–164 in state.py inspecting non-None values and merging per task_id.         │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Enterprise Agentic Firewall (HR, Finance, Security, Capacity)                      │
│ WHAT I BUILT: 4 discrete evaluation nodes querying distinct enterprise data stores in parallel. │
│               - HR: Direct SQL lookup on Supabase for leave/employment status.                  │
│               - Finance: 1024-dim vector cosine match against budget remaining in Supabase.       │
│               - Security: RAG vector search against security policy document chunks.             │
│               - Capacity: Live Atlassian Jira API JQL query checking open ticket load.           │
│ WHY: To intercept non-compliant, unbudgeted, or unexecutable assignments before dispatch.       │
│ FILE: backend/agent/nodes/hr_checker.py, finance_checker.py, security_checker.py, capacity_checker.py │
│ FUNCTION/CLASS: hr_checker_node, finance_checker_node, security_checker_node, capacity_checker_node│
│ EVIDENCE: Supabase client calls, RPC executions, Jira REST client queries.                       │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Deterministic HITL Pause & Resume Architecture                                     │
│ WHAT I BUILT: Graph execution halt using LangGraph `interrupt()` and `interrupt_before`, state   │
│               serialization to `MemorySaver`, SSE streaming of review payload, and resumption    │
│               via FastAPI `POST /api/hitl-resume` feeding `Command(resume=...)`.                  │
│ WHY: Eliminates autonomous dispatch hallucination risk by requiring explicit human sign-off on   │
│      remediated policies, re-routed assignees, and deferred tasks.                               │
│ FILE: backend/agent/nodes/hitl_interrupt.py, backend/api/routes/hitl.py                         │
│ FUNCTION/CLASS: hitl_interrupt_node(), hitl_resume(), _resume_graph_a()                          │
│ EVIDENCE: Native interrupt invocation, Command pattern resumption in background thread.          │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Structured LLM Gateway with Nvidia NIM & Gemini                                    │
│ WHAT I BUILT: Centralised LLM client with Pydantic JSON schema flattening, forced tool-calling,  │
│               automatic exponential backoff (2s, 4s, 8s), and 1024-dim embedding generation.    │
│ WHY: Enforces deterministic JSON structure from open-source models (Llama 3.1 70B) and handles   │
│      1M-token context extraction via Gemini 2.5 Flash without malformed JSON parsing errors.     │
│ FILE: backend/agent/llm_client.py, backend/agent/nodes/extractor.py                              │
│ FUNCTION/CLASS: structured_output(), chat_completion(), get_embedding(), _flatten_schema()       │
│ EVIDENCE: Recursive schema flattener, tool_choice forcing, Pydantic validation error handling.   │
│ STATUS: [IMPLEMENTED + TESTED] (Smoke test in llm_client.py verified)                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Real-Time SSE Streaming Infrastructure                                             │
│ WHAT I BUILT: Asynchronous queue-based Server-Sent Events manager (`SSEManager`) with per-thread │
│               event queues, 15-second proxy keep-alive heartbeats, and overflow protection.      │
│ WHY: WebSockets introduce bidirectional overhead for what is fundamentally a unidirectional     │
│      agent telemetry stream from FastAPI to Next.js.                                             │
│ FILE: backend/api/sse.py, backend/api/main.py                                                    │
│ FUNCTION/CLASS: SSEManager, stream_events(), push_event(), stream_graph_events()                 │
│ EVIDENCE: Async generator yielding `data: {json}\n\n` and `: heartbeat\n\n`.                     │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Async Progress Tracker Loop with Loop Guardrails (Graph B)                         │
│ WHAT I BUILT: Webhook-driven event loop processing Slack replies and GitHub commits. Features an │
│               intent classifier, dynamic Jira transitions ("Done", "Blocked"), and a finite      │
│               turn-count guardrail (`turn_count >= 2`) forcing escalation to prevent spam loops. │
│ WHY: Tasks frequently stall post-meeting; automating status synchronization directly from dev    │
│      chatter eliminates administrative overhead.                                                 │
│ FILE: backend/agent/graph_b.py, backend/agent/nodes/intent_parser.py, escalation.py, slack_dm.py │
│ FUNCTION/CLASS: route_intent(), intent_parser_node(), escalation_node(), slack_dm_node()          │
│ EVIDENCE: Conditional edge evaluating turn_count, Jira transition ID dynamic lookups.            │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CONTRIBUTION: Enterprise Data Connectors & Vector Migration Engine                               │
│ WHAT I BUILT: Automated ETL pipelines syncing BambooHR JSON, Google Sheets budget spreadsheets,  │
│               and PDF security policy manuals into Supabase PostgreSQL + pgvector with RPCs.     │
│ WHY: Establishes the authoritative Layer 2 enterprise memory against which agent firewalls run.  │
│ FILE: backend/connectors/sync_hr.py, sync_finance.py, sync_security.py, supabase_agent_migration.sql│
│ FUNCTION/CLASS: sync_hr_data(), sync_finance_data(), sync_security_data(), SQL RPC definitions   │
│ EVIDENCE: gspread Google auth, pypdf extraction, Supabase RPC vector cosine similarity SQL.      │
│ STATUS: [IMPLEMENTED]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Personal Contribution vs. Team Contribution Matrix
Because the repository represents an end-to-end individual build by the candidate, the boundary is between **Core Self-Built System** vs **External Platforms/Libraries**:

| Architectural Area | My Personal Contribution (Code Authored) | External Platform / Library Dependency |
|---|---|---|
| **Graph Orchestration** | Custom StateGraphs, custom reducers, conditional routers, interrupt logic | LangGraph framework primitives (`StateGraph`, `interrupt`, `MemorySaver`) |
| **Agent Reasoning** | System prompts, Pydantic schemas, resolution mapping logic, schema flattener | Nvidia NIM hosted API (Llama 3.1 70B), Google Gemini API |
| **Vector DB & Data** | Supabase SQL migration, custom cosine similarity RPC functions, ETL scripts | Supabase PostgreSQL, `pgvector` extension |
| **Backend & API** | FastAPI route handlers, SSE queue manager, HMAC signature verifiers | FastAPI, Uvicorn, Starlette `StreamingResponse` |
| **Integrations** | Dynamic Jira transition resolver, JQL queries, Slack DM & user ID resolver | Atlassian Jira Cloud REST API, Slack Bolt/WebClient SDK |
| **Frontend UI** | Next.js 14 dashboard, SSE event hook (`useAgentStream`), 4-panel wireframe | React 18, Tailwind CSS, Framer Motion |

---

# 3. COMPLETE ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          VERIDIAN WORKOS ARCHITECTURE                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 [CLIENT / FRONTEND]
   Next.js 14 App (Port 3000)
   ├── AutoLoader (Reads transcript.txt)
   ├── WorkflowHeader (7-stage visual pipeline tracker)
   ├── MeetingOverview (TL;DR, Attendees, Metadata)
   ├── DecisionsMade (Extracted items, Conflict badges, Provenance)
   ├── ApprovalsPanel (HITL Review Gate, Action Selectors)
   └── ProgressTracker (Jira Status, Dispatch Progress, Slack status)
         ▲                                                │
         │ (1) GET /api/stream/{thread_id} [SSE]          │ (2) POST /api/meeting-ended
         │                                                │     POST /api/hitl-resume
         ▼                                                ▼
 ═════════════════════════════════════════════════════════════════════════════════════════════════════════
 [FASTAPI BACKEND API LAYER] (Port 8000)
   ├── api/main.py (CORS, Lifespan, Routing)
   ├── api/sse.py (SSEManager: Per-Thread asyncio.Queue, Heartbeats)
   ├── api/routes/meeting.py (Meeting Webhook Receiver → BackgroundTasks)
   ├── api/routes/hitl.py (HITL Resume Receiver → BackgroundTasks)
   ├── api/routes/slack.py (Slack Event Webhook + HMAC-SHA256 Verifier)
   └── api/routes/github.py (GitHub Push Webhook + HMAC-SHA256 Verifier)
         │                                                │
         ▼                                                ▼
 ═════════════════════════════════════════════════════════════════════════════════════════════════════════
 [LANGGRAPH WORKFLOW ORCHESTRATOR]
   
   ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
   │ GRAPH A: SYNCHRONOUS MEETING PIPELINE (HITL-GATED)                                                │
   │                                                                                                   │
   │   [START]                                                                                         │
   │      │                                                                                            │
   │      ▼                                                                                            │
   │   ingest_node ────────────(Duplicate?)───────────► [END: Idempotency Drop]                       │
   │      │ (New Meeting)                                                                              │
   │      ▼                                                                                            │
   │   extractor_node (Gemini 2.5 Flash / 1M Context + Pydantic ExtractionOutput)                      │
   │      │                                                                                            │
   │      ├───────────────────┬───────────────────┬───────────────────┐                                │
   │      ▼ [PARALLEL]        ▼ [PARALLEL]        ▼ [PARALLEL]        ▼ [PARALLEL]                     │
   │   hr_checker_node    finance_checker_node  security_checker_node capacity_checker_node           │
   │   (SQL Status Lookup) (pgvector Budget RAG) (pgvector Policy RAG) (Live Jira API JQL)             │
   │      │                   │                   │                   │                                │
   │      │                   │                   │          (Over Capacity or Inactive HR?)           │
   │      │                   │                   │          ├───────────────┴───────────────┐         │
   │      │                   │                   │          ▼ YES                           ▼ NO      │
   │      │                   │                   │   auto_router_node                   │         │
   │      │                   │                   │   (Least-Loaded Active)              │         │
   │      │                   │                   │          │                               │         │
   │      ▼                   ▼                   ▼          ▼                               ▼         │
   │   ─────────────────────────── merge_node (Fan-In Barrier) ───────────────────────────────────    │
   │                                  │ (update_tasks_reducer merges partial states)                   │
   │                                  ▼                                                                │
   │                             resolution_generator_node (Llama 3.1 70B Pydantic ResolutionOutput)   │
   │                                  │                                                                │
   │                         (Any Flags Raised?)                                                       │
   │                         ├───────────────────────────────────┐                                     │
   │                         ▼ YES (Non-PROCEED)                 ▼ NO (All Clear)                      │
   │                     hitl_interrupt_node                     │                                     │
   │                     [PAUSE: MemorySaver Checkpoint]         │                                     │
   │                         │                                   │                                     │
   │                         ▼ (Resumed by POST /api/hitl-resume)│                                     │
   │                     state_update_node ◄─────────────────────┘                                     │
   │                         │ (Mutate assignees, titles, descriptions, statuses)                      │
   │                         ▼                                                                         │
   │                     dispatcher_node (Jira POST /rest/api/3/issue + Slack DMs & Summary)           │
   │                         │                                                                         │
   │                         ▼                                                                         │
   │                       [END: Dispatched]                                                           │
   └───────────────────────────────────────────────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
   │ GRAPH B: ASYNC PROGRESS TRACKER LOOP                                                              │
   │                                                                                                   │
   │   [Slack Webhook] ────────► intent_parser_node (Llama 3.1 70B Intent Classifier)                  │
   │                                 │                                                                 │
   │         ┌───────────────────────┼───────────────────────────────┐                                 │
   │         ▼ COMPLETED             ▼ BLOCKED / (turn >= 2)         ▼ AMBIGUOUS (turn < 2)            │
   │   ticket_resolver_node    escalation_node                 slack_dm_node                           │
   │   (Jira: Done)            (Jira: Blocked + Alert Mgr)     (Ask Clarification, turn_count + 1)     │
   │         │                       │                               │                                 │
   │         ▼                       ▼                               └──────────► [Loop Back]          │
   │       [END]                   [END]                                                               │
   │                                                                                                   │
   │   [GitHub Webhook] ───────► semantic_matcher_node (Llama 3.1 70B Commit Matcher)                 │
   │                                 │ (confidence >= 0.6)                                             │
   │                                 ▼                                                                 │
   │                           ticket_resolver_node ──► [END: Jira Marked Done]                        │
   └───────────────────────────────────────────────────────────────────────────────────────────────────┘
         │                                                │
         ▼                                                ▼
 ═════════════════════════════════════════════════════════════════════════════════════════════════════════
 [DATA & ENTERPRISE INTEGRATION LAYER]
   ├── Supabase PostgreSQL + pgvector (Tables: hr_employees, finance_budgets, security_policies,
   │                                           employees, processed_meetings, audit_trail)
   │   ├── RPC: match_finance_budgets (Cosine similarity <=> over 1024-dim vectors)
   │   └── RPC: match_security_policies (Cosine similarity <=> over 1024-dim vectors)
   ├── Atlassian Jira Cloud REST API v3 (JQL search, issue creation, transitions to Done/Blocked)
   ├── Slack API (Bot WebClient, user ID resolution, direct message dispatch, channel summaries)
   └── External Connectors (Google Sheets API via gspread, BambooHR JSON, PyPDF security manual)
```

---

# 4. LANGGRAPH / WORKFLOW ORCHESTRATION

### Graph Node Inventory

#### Graph A Nodes (Synchronous Meeting Pipeline)
1. **`ingest_node`** (`backend/agent/nodes/ingest.py`): Idempotency barrier querying `processed_meetings`.
2. **`extractor_node`** (`backend/agent/nodes/extractor.py`): Pydantic extraction of tasks, decisions, meeting context.
3. **`hr_checker_node`** (`backend/agent/nodes/hr_checker.py`): SQL ILIKE query against `hr_employees`.
4. **`finance_checker_node`** (`backend/agent/nodes/finance_checker.py`): 1024-dim pgvector RAG against `finance_budgets`.
5. **`security_checker_node`** (`backend/agent/nodes/security_checker.py`): 1024-dim pgvector RAG against `security_policies`.
6. **`capacity_checker_node`** (`backend/agent/nodes/capacity_checker.py`): Live Atlassian Jira JQL open ticket query.
7. **`auto_router_node`** (`backend/agent/nodes/auto_router.py`): SQL query to assign least-loaded active employee.
8. **`merge_node`** (`backend/agent/nodes/merge.py`): Synchronization barrier and audit log recorder.
9. **`resolution_generator_node`** (`backend/agent/nodes/resolution_generator.py`): Pydantic remediation generator.
10. **`hitl_interrupt_node`** (`backend/agent/nodes/hitl_interrupt.py`): Native `interrupt()` caller.
11. **`state_update_node`** (`backend/agent/nodes/state_update.py`): Human decision state mutation engine.
12. **`dispatcher_node`** (`backend/agent/nodes/dispatcher.py`): Jira issue creator and Slack DM dispatcher.

#### Graph B Nodes (Async Progress Tracker)
1. **`intent_parser_node`** (`backend/agent/nodes/intent_parser.py`): Classification of Slack responses into structured intent.
2. **`ticket_resolver_node`** (`backend/agent/nodes/ticket_resolver.py`): Transitions Jira ticket status to "Done".
3. **`escalation_node`** (`backend/agent/nodes/escalation.py`): Transitions Jira to "Blocked" and alerts management in Slack.
4. **`slack_dm_node`** (`backend/agent/nodes/slack_dm.py`): Sends targeted clarification DMs and increments turn counter.
5. **`semantic_matcher_node`** (`backend/agent/nodes/semantic_matcher.py`): Matches GitHub commits to active Jira tickets.

### State Definition & Field Specifications
Defined in `backend/agent/state.py`:

```python
class AgentState(TypedDict):
    # Phase 1: Ingestion & Extraction
    meeting_id: str
    transcript: str
    tasks: Annotated[Dict[str, Task], update_tasks_reducer]
    key_decisions: List[DecisionItem]
    meeting_context: Dict[str, Any]

    # Phase 2.5: Resolutions
    resolutions: List[AIResolution]

    # Phase 3: HITL Review
    interrupt_payload: Optional[Dict[str, Any]]
    hitl_decisions: Dict[str, str]

    # Phase 4: Dispatch & Execution
    dispatched_tickets: List[Dict[str, Any]]
    manager_approved: bool

    # Graph B: Async Tracker Loop
    turn_count: int
    tracker_task_id: Optional[str]
    tracker_assignee: Optional[str]
    last_slack_reply: Optional[str]
    parsed_intent: Optional[str]
    intent_confidence: Optional[float]
```

### The Parallel-Safe Reducer (`update_tasks_reducer`)
When LangGraph executes parallel branches (`hr_checker_node`, `finance_checker_node`, `security_checker_node`, `capacity_checker_node`), each node returns a partial dictionary update for `tasks`. Without a custom reducer, standard dictionary assignment overwrites keys from concurrent branches.

```python
def update_tasks_reducer(current: Dict[str, Task], update: Dict[str, Task]) -> Dict[str, Task]:
    merged = dict(current)
    for task_id, task_update in update.items():
        if task_id in merged:
            existing = dict(merged[task_id])
            for key, value in task_update.items():
                if value is not None:
                    existing[key] = value
            merged[task_id] = existing
        else:
            merged[task_id] = task_update
    return merged
```
This guarantees that `hr_checker` writing `hr_status` and `security_checker` writing `security_flag` merge into the exact same `Task` object without race conditions or data loss.

### Routing Logic & Conditional Edges
1. **`route_ingest`**: Evaluates `state.get("__drop__")`. If `True`, returns `END` (idempotency drop); otherwise returns `"extractor_node"`.
2. **`route_capacity`**: Scans all tasks in `state["tasks"]`. If any task has `capacity_flag` set or `hr_status` not in `("ACTIVE", "NOT_FOUND", "QUERY_ERROR", None)`, routes to `"auto_router_node"`; otherwise routes directly to `"merge_node"`.
3. **`route_resolution`**: Scans `state["resolutions"]`. If any resolution has `suggested_action != "PROCEED"`, routes to `"hitl_interrupt_node"`; if all are `"PROCEED"`, routes straight to `"state_update_node"`.
4. **`route_intent` (Graph B)**: Evaluates `state["parsed_intent"]` and `state["turn_count"]`:
   - `"COMPLETED"` → `"ticket_resolver_node"`
   - `"BLOCKED"` or `turn_count >= 2` → `"escalation_node"`
   - `"AMBIGUOUS"` (with `turn_count < 2`) → `"slack_dm_node"`
5. **`route_after_semantic_match` (Graph B GitHub)**: If `tracker_task_id` is set and `intent_confidence >= 0.6`, routes to `"ticket_resolver_node"`; otherwise `END`.

### Comparison: Why LangGraph vs. Alternatives

| Orchestration Approach | Suitability for Veridian | Technical Bottleneck / Reason Rejected |
|---|---|---|
| **Vanilla Python Functions** | ❌ Inadequate | No native checkpointer suspension across HTTP boundaries; manual state reconciliation across async threads is error-prone. |
| **Sequential API Chains** | ❌ Inadequate | Forces 4 independent firewall checks to run sequentially (4x latency penalty); cannot handle parallel fan-out / fan-in. |
| **Simple LLM Chain (LangChain `|`)** | ❌ Inadequate | Linear Directed Acyclic Graphs (DAGs) cannot handle cyclical loops (Graph B turn counter) or pause-and-resume checkpointers. |
| **LangGraph (StateGraph)** | ✅ **Optimal** | Native checkpointer serialization (`MemorySaver`), first-class parallel fan-out with custom reducers (`Annotated`), and built-in `interrupt()` primitives. |

---

# 5. AGENT / REASONING ARCHITECTURE

### System Classification
Veridian is a **Hybrid Deterministic Workflow and Constrained Agentic System** with:
- Deterministic DAG topology for core execution stages.
- Autonomous semantic tool-calling for entity extraction and policy resolution.
- Parallel policy-evaluation checkers interfacing with external databases.
- Human-in-the-Loop interrupt gate.
- Cyclical asynchronous agent loop with finite guardrails for post-meeting progress tracking.

### Component-by-Component Reasoning Breakdown

```
NAME: Extractor Agent (extractor_node)
PURPOSE: Parse unstructured transcript into strictly typed task entities, key decisions, and meeting context.
INPUT: state["transcript"] (preprocessed with meeting header context)
PROCESS: Invokes Google Gemini 2.5 Flash via `with_structured_output(ExtractionOutput)`.
TOOLS: Pydantic Schema Tool-Calling (`ExtractionOutput`, `TaskExtraction`, `DiscussionFlag`).
OUTPUT: Dict with `tasks` (Dict[str, Task]), `key_decisions`, and `meeting_context`.
NEXT STEP: Fan-out to hr_checker, finance_checker, security_checker, capacity_checker.
FAILURE HANDLING: Catches exceptions, logs errors; returns structured empty defaults to prevent pipeline crash.
```

```
NAME: HR Status Checker (hr_checker_node)
PURPOSE: Check employee leave/availability status against authoritative HR database.
INPUT: state["tasks"][task_id]["assignee"]
PROCESS: Executes SQL ILIKE query against Supabase `hr_employees` table.
TOOLS: Supabase Client SQL Query (`hr_employees`).
OUTPUT: Partial task update with `hr_status` and `hr_provenance`.
NEXT STEP: merge_node (or auto_router_node via capacity conditional edge).
FAILURE HANDLING: SQL failures marked as `hr_status = "QUERY_ERROR"`; missing users marked as `"NOT_FOUND"`.
```

```
NAME: Semantic Budget Checker (finance_checker_node)
PURPOSE: Identify unbudgeted compute/infrastructure expenses using semantic vector search.
INPUT: Task title + resource_type string.
PROCESS: Generates 1024-dim Nvidia embedding; executes `match_finance_budgets` Supabase RPC (threshold 0.50).
TOOLS: Nvidia NIM `nv-embedqa-e5-v5` + Supabase RPC.
OUTPUT: Partial task update with `finance_flag` and `finance_provenance` if budget_remaining <= 0.
NEXT STEP: merge_node.
FAILURE HANDLING: Embedding/RPC exceptions caught and logged; task remains unflagged rather than crashing graph.
```

```
NAME: Security Policy Enforcement Agent (security_checker_node)
PURPOSE: Detect corporate policy violations (GDPR, quarantine rules, data handling).
INPUT: Task title + transcript_quote string.
PROCESS: Generates 1024-dim Nvidia embedding; executes `match_security_policies` Supabase RPC (threshold 0.50).
TOOLS: Nvidia NIM `nv-embedqa-e5-v5` + Supabase RPC.
OUTPUT: Partial task update with `security_flag`, `security_confidence`, and `security_provenance`.
NEXT STEP: merge_node.
FAILURE HANDLING: Catches exceptions, logs error; leaves security fields null.
```

```
NAME: Capacity & Load Checker (capacity_checker_node)
PURPOSE: Prevent overloading employees and enforce new-hire workload caps.
INPUT: Assignee name + Supabase `employees` status.
PROCESS: Evaluates employee tier (NEW_HIRE threshold = 2, regular = 10); queries live Jira REST API JQL.
TOOLS: Atlassian Jira Cloud REST API (`GET /rest/api/3/search`).
OUTPUT: Partial task update with `capacity_flag` and `capacity_provenance`.
NEXT STEP: route_capacity conditional edge (auto_router_node or merge_node).
FAILURE HANDLING: If Jira credentials missing or API fails, logs warning and skips flag.
```

```
NAME: Autonomous Assignee Router (auto_router_node)
PURPOSE: Automatically select the least-loaded active employee when original assignee is unavailable.
INPUT: Tasks with capacity_flag or non-active hr_status.
PROCESS: Executes SQL query on Supabase `employees` where `status = 'ACTIVE'` ORDER BY `open_tickets ASC LIMIT 1`.
TOOLS: Supabase Client SQL Query.
OUTPUT: Partial task update with `rerouted_assignee` and `capacity_provenance`.
NEXT STEP: merge_node.
FAILURE HANDLING: If no active employee found, logs warning; preserves original assignee.
```

```
NAME: AI Resolution Engine (resolution_generator_node)
PURPOSE: Generate policy-compliant remediation plans (REFRAME, REROUTE, DEFER, OVERRIDE, PROCEED).
INPUT: Aggregated task state and firewall flags.
PROCESS: Invokes Nvidia NIM Llama 3.1 70B with forced tool calling (`ResolutionOutput`).
TOOLS: Nvidia NIM Llama 3.1 70B via `structured_output(ResolutionOutput)`.
OUTPUT: `resolutions` list and task updates with `reframed_title`, `reframed_description`, `resolution_action`.
NEXT STEP: route_resolution conditional edge (hitl_interrupt_node or state_update_node).
FAILURE HANDLING: On LLM failure, defaults action to `"OVERRIDE"` to force human review.
```

```
NAME: Slack Intent Classifier Agent (intent_parser_node — Graph B)
PURPOSE: Classify informal Slack status updates into deterministic finite states.
INPUT: `state["last_slack_reply"]`
PROCESS: Invokes Llama 3.1 70B via `structured_output(IntentOutput)`.
TOOLS: Nvidia NIM Llama 3.1 70B.
OUTPUT: `parsed_intent` (COMPLETED, BLOCKED, AMBIGUOUS), `intent_confidence`, `reasoning`.
NEXT STEP: route_intent conditional edge.
FAILURE HANDLING: On failure, defaults to `"AMBIGUOUS"` with confidence `0.0`.
```

```
NAME: GitHub Semantic Commit Matcher (semantic_matcher_node — Graph B)
PURPOSE: Associate incoming Git push commits with active Jira tickets.
INPUT: Git commit message, branch name, list of open tasks.
PROCESS: Invokes Llama 3.1 70B via `structured_output(TicketMatch)` to semantically score match.
TOOLS: Nvidia NIM Llama 3.1 70B.
OUTPUT: `tracker_task_id`, `intent_confidence`, `parsed_intent = "COMPLETED"`.
NEXT STEP: route_after_semantic_match conditional edge (ticket_resolver_node or END).
FAILURE HANDLING: If confidence < 0.6 or parse fails, returns empty dict (routes to END).
```

---

# 6. MEETING / ACTION-ITEM INTELLIGENCE

### Ingestion & Transcript Preprocessing
- Raw unstructured transcript enters through `POST /api/meeting-ended`.
- `preprocess_transcript()` (`backend/agent/nodes/extractor.py`) injects domain header metadata identifying key attendees (Scott as host, Josh, Jason on leave, Dov as new hire, Korina, Gabe, Kenny) to prime speaker disambiguation across pronouns ("I will...", "I'm gonna...").

### Extraction Mechanism & Pydantic Schemas
Extraction runs through `ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)` using native tool calling against the Pydantic schema:

```python
class TaskExtraction(BaseModel):
    task_id: str
    title: str
    assignee: str = Field(default="UNASSIGNED")
    resource_type: str = Field(default="unknown")
    transcript_quote: str = Field(default="")

class DiscussionFlag(BaseModel):
    topic: str
    people_mentioned: List[str]
    transcript_quote: str
    resource_type: str  # hr_check | enterprise_compute | security | capacity_check

class DecisionExtraction(BaseModel):
    decision: str
    context_quote: str

class ExtractionOutput(BaseModel):
    meeting_context: MeetingContext
    tasks: List[TaskExtraction]
    discussion_flags: List[DiscussionFlag]
    key_decisions: List[DecisionExtraction]
    not_actioned: List[str]
```

### Owner Extraction & Ambiguity Handling
- Assignees are resolved using verbatim dialogue matching. If a task cannot be tied to a speaker or explicit name, `assignee` is set to `"UNASSIGNED"`.
- `transcript_quote` is mandatory for every task to provide an indisputable audit trail back to the spoken words.

### Discussion Flags vs. Action Items
The system implements a two-tier extraction model:
1. **Explicit Tasks (`tasks`):** Direct work commitments assigned to named individuals.
2. **Discussion Flags (`discussion_flags`):** Conversational mentions of high-risk topics (paternity leave, compute costs, confidential merge requests, new hires) that require policy firewall validation even if not framed as an explicit task.

---

# 7. HUMAN-IN-THE-LOOP (HITL) ARCHITECTURE

### What Requires Approval
Any task where the AI Agentic Firewall raises a conflict:
- **Security Flag:** Attempted bypass of staging quarantine or data privacy rules.
- **Budget Flag:** Resource requests against $0 or depleted budget categories.
- **HR Flag:** Work assigned to an employee on paternity/maternity/medical leave.
- **Capacity Flag:** Assignee exceeds Jira open-ticket workload thresholds.

### Pause Mechanism & State Persistence
- Graph A compiles with `interrupt_before=["hitl_interrupt_node"]` and checkpointer `MemorySaver()`.
- When `resolution_generator_node` completes and `route_resolution()` detects any resolution `!= "PROCEED"`, the graph enters `hitl_interrupt_node`.
- Inside `hitl_interrupt_node`, `interrupt(interrupt_payload)` halts execution.
- LangGraph serializes the full `AgentState` to the checkpointer under `thread_id`.
- The background task in `api/routes/meeting.py` yields a `hitl_ready` SSE event to the client and terminates its coroutine cleanly without blocking server threads.

### Resumption Flow
1. Next.js frontend renders the **Approvals Panel** (Section 3 of the 4-panel dashboard).
2. The manager reviews flagged tasks, chooses an action (`REFRAME`, `REROUTE`, `DEFER`, `OVERRIDE`, `PROCEED`), and clicks **"Execute Workflow"**.
3. Frontend issues `POST /api/hitl-resume` with payload:
   ```json
   {
     "thread_id": "meeting-demo-123-abc",
     "hitl_decisions": {
       "t1": "REFRAME",
       "t2": "REROUTE"
     }
   }
   ```
4. FastAPI background task calls:
   ```python
   graph_a.invoke(Command(resume=hitl_decisions), config={"configurable": {"thread_id": thread_id}})
   ```
5. `interrupt()` unblocks, returns `hitl_decisions`, sets `manager_approved = True`, and execution flows linearly into `state_update_node` → `dispatcher_node` → `END`.

### Implementation Status
`[IMPLEMENTED]` (Fully verified in `graph_a.py`, `hitl_interrupt.py`, `hitl.py`, and `ApprovalsPanel.jsx`).

---

# 8. TOOL / INTEGRATION ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE: Atlassian Jira Cloud REST API                                                           │
│ PURPOSE: Query open ticket capacity; create new Task issues; update issue transitions.           │
│ PROTOCOL: HTTPS REST (v3 API)                                                                    │
│ AUTHENTICATION: HTTP Basic Auth (JIRA_EMAIL + JIRA_API_TOKEN)                                    │
│ ENDPOINTS USED:                                                                                  │
│   - GET  /rest/api/3/search (JQL capacity queries)                                               │
│   - POST /rest/api/3/issue (Issue creation)                                                      │
│   - GET  /rest/api/3/issue/{key}/transitions (Transition ID discovery)                           │
│   - POST /rest/api/3/issue/{key}/transitions (Move to Done / Blocked)                            │
│   - PUT  /rest/api/3/issue/{key} (Fallback label tagging)                                        │
│ HOW AI USES IT: Backend executes deterministic HTTP requests based on LLM state parameters.     │
│ FILE: backend/agent/nodes/capacity_checker.py, dispatcher.py, ticket_resolver.py, escalation.py  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE: Slack Web API                                                                           │
│ PURPOSE: Deliver direct messages with ticket links & provenance; post executive channel summaries│
│ PROTOCOL: HTTPS REST / Slack SDK                                                                 │
│ AUTHENTICATION: Bearer Token (SLACK_BOT_TOKEN)                                                   │
│ ENDPOINTS USED:                                                                                  │
│   - GET  users.list (Resolve username/display name to Slack User ID)                             │
│   - POST chat.postMessage (Send DMs and channel summaries)                                       │
│ HOW AI USES IT: Deterministic dispatch with LLM-generated reframe notes and verbatim quotes.     │
│ FILE: backend/agent/nodes/dispatcher.py, slack_dm.py, ticket_resolver.py, escalation.py          │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE: Supabase PostgreSQL + pgvector                                                          │
│ PURPOSE: Relational storage, capacity cache, idempotency ledger, and vector similarity search.   │
│ PROTOCOL: PostgreSQL / Supabase PostgREST + RPC over HTTPS                                       │
│ AUTHENTICATION: Supabase Service Role Key (SUPABASE_SERVICE_KEY)                                 │
│ RPC FUNCTIONS:                                                                                   │
│   - match_finance_budgets(query_embedding vector(1024), match_threshold float, match_count int)  │
│   - match_security_policies(query_embedding vector(1024), match_threshold float, match_count int)│
│ TABLES USED: hr_employees, finance_budgets, security_policies, employees, processed_meetings,    │
│              audit_trail                                                                         │
│ FILE: backend/agent/nodes/ingest.py, hr_checker.py, finance_checker.py, security_checker.py,     │
│       auto_router.py, merge.py, backend/supabase_agent_migration.sql                             │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE: Google Sheets API                                                                       │
│ PURPOSE: ETL synchronization of Q3 enterprise budget categories and allocations.                 │
│ PROTOCOL: HTTPS REST via gspread                                                                 │
│ AUTHENTICATION: Google Cloud Service Account JSON (`service-account.json`)                       │
│ FILE: backend/connectors/sync_finance.py                                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE: GitHub Webhook Integration                                                              │
│ PURPOSE: Event-driven tracking of commit messages to close matching Jira tickets.                │
│ PROTOCOL: Incoming HTTPS POST Webhook with HMAC-SHA256 signature verification                   │
│ AUTHENTICATION: X-Hub-Signature-256 HMAC digest check (`GITHUB_WEBHOOK_SECRET`)                 │
│ FILE: backend/api/routes/github.py, backend/agent/nodes/semantic_matcher.py                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 9. SERVER-SENT EVENTS / REAL-TIME ARCHITECTURE

### Why SSE vs. WebSockets / Polling
- **SSE vs. Polling:** Polling introduces latency gaps and floods the backend with empty queries. SSE streams events instantly as graph nodes finish.
- **SSE vs. WebSockets:** The agent-to-UI communication model is strictly unidirectional (server pushes state changes to client; client submits actions via standard HTTP POST). SSE operates over standard HTTP/1.1 or HTTP/2, requires no custom connection handshakes, traverses enterprise firewalls seamlessly, and natively supports automatic browser reconnection.

### Stream Lifecycle & Event Types
Managed by `SSEManager` in `backend/api/sse.py`:

```
POST /api/meeting-ended
   │ (Creates thread_id, registers asyncio.Queue)
   ▼
GET /api/stream/{thread_id}
   │
   ├─► "processing_started"   (Graph begins execution)
   ├─► "resolution_ready"     (Firewall checks complete, resolutions prepared)
   ├─► "hitl_ready"           (Graph paused at HITL checkpoint)
   ├─► ": heartbeat\n\n"      (Sent every 15s to keep proxy connections alive)
   │
   ▼ (Manager approves in UI → POST /api/hitl-resume)
   │
   ├─► "hitl_resuming"        (Graph unpaused via Command pattern)
   ├─► "dispatched"           (Jira tickets created, Slack DMs sent)
   ├─► "complete"             (Sentinel None sent, stream closes cleanly)
   └─► "error"                (Unhandled exception payload, stream closes)
```

### Queue Management & Resilience
- **Buffer Cap:** `MAX_QUEUE_SIZE = 100` per thread. If the frontend connects slowly, older events are dropped to prevent memory leaks (`asyncio.QueueFull` handling).
- **Proxy Buffering Prevention:** Custom headers `X-Accel-Buffering: no` and `Cache-Control: no-cache` are attached to ensure intermediate NGINX proxies do not buffer chunks.

---

# 10. BACKEND / FASTAPI

### Endpoint Catalog

```
METHOD: POST
PATH: /api/meeting-ended
PURPOSE: Webhook entry point triggering Graph A in background.
REQUEST MODEL: MeetingWebhookRequest { meeting_id: str, transcript: str }
RESPONSE MODEL: MeetingWebhookResponse { status: "processing", thread_id: str, meeting_id: str }
FUNCTION: meeting_ended()
FILE: backend/api/routes/meeting.py
```

```
METHOD: GET
PATH: /api/stream/{thread_id}
PURPOSE: Server-Sent Events stream for real-time agent telemetry.
REQUEST: Path parameter thread_id
RESPONSE: text/event-stream
FUNCTION: stream_graph_events()
FILE: backend/api/main.py
```

```
METHOD: POST
PATH: /api/hitl-resume
PURPOSE: Resumes paused Graph A with manager decisions.
REQUEST MODEL: HITLResumeRequest { thread_id: str, hitl_decisions: Dict[str, str] }
RESPONSE MODEL: HITLResumeResponse { status: "resuming", thread_id: str, message: str }
FUNCTION: hitl_resume()
FILE: backend/api/routes/hitl.py
```

```
METHOD: POST
PATH: /api/slack-webhook
PURPOSE: Ingests Slack events, verifies HMAC-SHA256 signature, triggers Graph B.
REQUEST: Slack Event API JSON payload + X-Slack-Signature / X-Slack-Request-Timestamp headers
RESPONSE: 200 OK text/plain (returns within 3 seconds to satisfy Slack SLA)
FUNCTION: slack_webhook()
FILE: backend/api/routes/slack.py
```

```
METHOD: POST
PATH: /api/github-webhook
PURPOSE: Ingests GitHub push events, verifies HMAC-SHA256 signature, triggers Graph B matcher.
REQUEST: GitHub push payload + X-Hub-Signature-256 header
RESPONSE: 200 OK JSON { status: "processing", commits_queued: int, repo: str, branch: str }
FUNCTION: github_webhook()
FILE: backend/api/routes/github.py
```

```
METHOD: GET
PATH: /api/health
PURPOSE: Service liveness and graph compilation health check.
REQUEST: None
RESPONSE: 200 OK { status: "healthy", service: "veridian-workos-api", version: "1.0.0", graphs: {...} }
FUNCTION: health_check()
FILE: backend/api/main.py
```

---

# 11. DATA / STATE / MEMORY

### Complete Persistence & Storage Matrix

| Data Entity | Storage Engine | Table / Schema | State Mutator | Retention / Recovery |
|---|---|---|---|---|
| **Graph A State** | In-Memory (`MemorySaver`) | Volatile process RAM | All Graph A nodes | Preserved across `interrupt()`; lost on process restart. |
| **Meeting Idempotency** | Supabase PostgreSQL | `public.processed_meetings` | `ingest_node` | Persistent; prevents re-processing duplicate meeting IDs. |
| **Audit Trail** | Supabase PostgreSQL | `public.audit_trail` | `merge_node` | Persistent event log with provenance and confidence scores. |
| **HR & Leave Data** | Supabase PostgreSQL | `public.hr_employees` | `sync_hr.py` | Authoritative HRIS record cache. |
| **Budget Allocations** | Supabase pgvector | `public.finance_budgets` (1024-dim) | `sync_finance.py` | Persistent semantic vector index. |
| **Security Policies** | Supabase pgvector | `public.security_policies` (1024-dim)| `sync_security.py` | Persistent chunked PDF vector index. |
| **Capacity Cache** | Supabase PostgreSQL | `public.employees` | `sync_hr.py` / Migration | Authoritative active employee workload cache. |
| **Jira Tickets** | Atlassian Cloud | Jira Issue Store | `dispatcher_node`, `ticket_resolver_node` | Cloud-persistent external source of truth. |

---

# 12. AI OUTPUT RELIABILITY

### Hardened Reliability Mechanisms

```
FAILURE: Malformed / Hallucinated JSON Output from Open-Source LLMs
DETECTION: json.JSONDecodeError or pydantic.ValidationError in structured_output()
MITIGATION: 1. Schema Flattening: _flatten_schema() recursively resolves $ref and $defs into flat JSON schemas compatible with Nvidia NIM.
            2. Forced Tool Choice: tool_choice forces the model to emit a function call argument string.
            3. Pydantic Validation: Raw JSON parsed directly into strict BaseModel instances.
FILE/FUNCTION: backend/agent/llm_client.py -> structured_output()
```

```
FAILURE: Transient LLM Rate Limits (HTTP 429) or Network Blips (5xx)
DETECTION: openai.RateLimitError, APIConnectionError, APIStatusError >= 500
MITIGATION: Centralized exponential backoff retry wrapper (_with_retry): 3 attempts with 2^attempt second delays (2s, 4s, 8s). Non-retryable 4xx client errors fail fast.
FILE/FUNCTION: backend/agent/llm_client.py -> _with_retry()
```

```
FAILURE: Vector Dimension Mismatch in Embedding Pipeline
DETECTION: Length check vector != 1024 in get_embedding()
MITIGATION: Explicit dimension assertion before embedding vector leaves the client, preventing corrupted queries to pgvector.
FILE/FUNCTION: backend/agent/llm_client.py -> get_embedding()
```

```
FAILURE: AI Hallucination in Policy Remediation
DETECTION: Human manager inspection at HITL gate
MITIGATION: 1. Zero temperature (temperature=0.0) for deterministic structured output.
            2. Resolution Generator prompt enforces strict mapping rules (e.g. $0 budget ALWAYS forces DEFER).
            3. Mandatory HITL checkpoint pauses workflow before any ticket is created in Jira.
FILE/FUNCTION: backend/agent/nodes/resolution_generator.py, hitl_interrupt.py
```

---

# 13. FAILURE MODES & RESIDUAL RISKS

### Real Failure Mode Analysis

```
FAILURE MODE: Assignee Name Resolution Collision (e.g., two people named "Jason")
CAUSE: Transcripts use first names; SQL ILIKE matching uses `%name%`.
DETECTION: Multiple rows returned from hr_employees or employees query.
MITIGATION: Current implementation selects result.data[0].
RESIDUAL RISK: Potential to assign work to the wrong employee if first names collide. Production requires email/ID resolution.
FILE: backend/agent/nodes/hr_checker.py, auto_router.py
```

```
FAILURE MODE: Process Crash During HITL Pause
CAUSE: Graph checkpointer uses in-process MemorySaver.
DETECTION: FastAPI process restart clears in-memory state; POST /api/hitl-resume fails with thread not found.
MITIGATION: Documented production swap: replace MemorySaver with PostgresSaver pointing to Supabase.
RESIDUAL RISK: Active for local demo; production requires PostgresSaver.
FILE: backend/agent/graph_a.py (Lines 37-39, 211-215)
```

```
FAILURE MODE: Slack Webhook Timeout (> 3 Seconds)
CAUSE: LLM inference in Graph B takes 1.5–3.0s, causing Slack to retry and produce duplicate messages.
DETECTION: Slack retrying event delivery.
MITIGATION: Webhook endpoint immediately returns HTTP 200 OK and offloads Graph B execution to FastAPI BackgroundTasks.
RESIDUAL RISK: Zero webhook timeout risk.
FILE: backend/api/routes/slack.py (Lines 176–188)
```

```
FAILURE MODE: Slack Clarification Infinite Loop
CAUSE: Assignee repeatedly responds with vague updates ("still working on it", "maybe soon").
DETECTION: intent_parser classifies reply as AMBIGUOUS.
MITIGATION: Finite turn-count guardrail: route_intent checks `turn_count >= 2`. If exceeded, forces escalation to escalation_node and alerts manager.
RESIDUAL RISK: Zero infinite loop risk.
FILE: backend/agent/graph_b.py -> route_intent()
```

```
FAILURE MODE: Jira Transition ID Schema Variations
CAUSE: Different Jira projects use different internal IDs for "Done" or "Blocked" status transitions.
DETECTION: HTTP 400 when attempting hardcoded transition ID.
MITIGATION: Dynamic transition resolution (_get_jira_transition_id): queries `/rest/api/3/issue/{key}/transitions` at runtime and matches transition name case-insensitively.
RESIDUAL RISK: If project lacks a "Blocked" transition, falls back to adding `veridian-blocked` label.
FILE: backend/agent/nodes/ticket_resolver.py, escalation.py
```

---

# 14. TESTING

### Codebase Test Reality Audit
- **Unit / Integration Test Suite:** `[NOT VERIFIED FROM CODEBASE]` (No dedicated `tests/` directory or `pytest` suite present).
- **Smoke Tests:** `[IMPLEMENTED + TESTED]` Built-in execution blocks in `backend/agent/llm_client.py` testing live 1024-dim embedding generation and chat completion via Nvidia NIM.
- **Graph Compilation Verification:** `[IMPLEMENTED + TESTED]` `__main__` execution blocks in `backend/agent/graph_a.py` and `backend/agent/graph_b.py` verifying state graph compilation, node registry, and Mermaid diagram rendering.
- **End-to-End Test Harness:** `[IMPLEMENTED + TESTED]` The bundled Next.js `AutoLoader` automatically feeds `transcript.txt` (GitLab 12.2 Product Sync) through FastAPI, triggering all 4 firewall traps and verifying live Jira/Slack output.

---

# 15. PERFORMANCE / CONCURRENCY

### Concurrency Architecture
1. **Parallel Fan-Out:** LangGraph executes 4 firewall checkers concurrently. Total firewall evaluation latency equals `max(HR, Finance, Security, Capacity)` rather than `sum(...)`.
2. **Asynchronous Non-Blocking I/O:** FastAPI endpoints return immediate HTTP 200/processing acknowledgments, executing Graph A and Graph B inside `BackgroundTasks`.
3. **Queue-Based Event Streaming:** `asyncio.Queue` per thread allows the agent graph to push telemetry without waiting for frontend rendering.

### Performance Benchmarks
`NO VERIFIED PERFORMANCE BENCHMARK FOUND.`  
*(The codebase contains no load-testing scripts or formal latency logs. Do NOT claim sub-second SLAs or measured throughput figures on resume).*

---

# 16. COST ENGINEERING

### Model Selection & Cost Optimization Strategy
- **Hybrid LLM Routing:**
  - **Extraction Tier:** Google Gemini 2.5 Flash utilized for transcript extraction. Large 1M+ token context window accommodates complete meeting transcripts without chunking or context fragmentation.
  - **Reasoning & Tool-Calling Tier:** Nvidia NIM Llama 3.1 70B Instruct utilized exclusively for strict Pydantic JSON generation in firewall resolution and intent parsing.
- **Cost Reduction via Idempotency:** `ingest_node` checks Supabase `processed_meetings` before invoking any LLM, dropping duplicate webhooks at $0 LLM cost.
- **Deterministic Skipping:** Tasks with zero firewall flags bypass the `resolution_generator_node` LLM call entirely, defaulting directly to `PROCEED` (0 tokens consumed).

---

# 17. PRODUCTION-READINESS AUDIT

| Production Capability | Implementation Reality | Production Gap / Hardening Required |
|---|---|---|
| **Environment Config** | `[IMPLEMENTED]` Loaded via `.env` / `python-dotenv`. | Needs AWS Secrets Manager / HashiCorp Vault. |
| **Checkpointer State** | `[IMPLEMENTED - DEV]` In-process `MemorySaver`. | Must swap to `PostgresSaver` backed by Supabase. |
| **SSE Event Queues** | `[IMPLEMENTED - DEV]` In-memory `asyncio.Queue`. | Must swap to Redis Pub/Sub for multi-instance horizontal scale. |
| **Containerization** | `[NOT IMPLEMENTED]` No Dockerfile in repo. | Dockerfile + docker-compose needed. |
| **CI/CD Pipeline** | `[NOT IMPLEMENTED]` No `.github/workflows` in repo.| GitHub Actions CI pipeline needed. |
| **Authentication** | `[IMPLEMENTED - WEBHOOKS]` Slack/GitHub HMAC signatures.| User authentication (JWT/OAuth) needed for API endpoints. |
| **Observability** | `[IMPLEMENTED]` LangSmith tracing integrated. | Add Datadog/Prometheus metrics for API health. |

---

# 18. SCALABILITY ANALYSIS

```
CURRENT ARCHITECTURE (10 Users):
- Runs cleanly on a single FastAPI/Uvicorn process with MemorySaver and in-memory SSEManager queues.

100 USERS:
- Bottleneck: In-memory SSE queues consume RAM; checkpointer tied to single process.
- Fix: Swap MemorySaver to PostgresSaver; swap SSEManager to Redis Pub/Sub.

1,000 USERS:
- Bottleneck: External API rate limits (Jira REST API 429s, Nvidia NIM throughput limits).
- Fix: Implement Celery/ARQ distributed task queue with token bucket rate limiting for Jira API calls; provision dedicated Nvidia NIM microservice instances.

10,000 USERS:
- Bottleneck: Database connection pooling and vector index search latency under heavy concurrent load.
- Fix: Deploy PgBouncer connection pooling on Supabase; partition pgvector tables; place Next.js on CDN Edge (Vercel/Cloudflare).
```

---

# 19. SECURITY & ACCESS CONTROL

### Implemented Protections
1. **Webhook Cryptographic Verification:**
   - Slack: HMAC-SHA256 signature verification (`X-Slack-Signature`) with 5-minute replay attack window check (`_verify_slack_signature` in `api/routes/slack.py`).
   - GitHub: HMAC-SHA256 signature verification (`X-Hub-Signature-256`) using `hmac.compare_digest` (`_verify_github_signature` in `api/routes/github.py`).
2. **Credential Isolation:** API keys (Nvidia, Google, Supabase Service Role, Jira, Slack) managed strictly via environment variables.
3. **Database Security:** Vector search executed via Postgres RPC functions (`SECURITY DEFINER` / parameterized SQL), preventing SQL injection.

### Identified Security Gaps
- FastAPI endpoints (`/api/meeting-ended`, `/api/hitl-resume`) lack user-level JWT/OAuth2 authentication (open on local network).
- CORS configuration allows `localhost:3000` / `localhost:3001` (requires strict domain whitelisting in production).

---

# 20. TECHNICAL TRADE-OFFS

```
DECISION: LangGraph StateGraph vs. Linear Python Scripts
WHY: Meeting processing requires parallel fan-out with deep-merging state reducers and durable execution halts (HITL).
ALTERNATIVE: Sequential async Python functions.
ADVANTAGE: Native checkpointer serialization, state graph visualizability, durable pause/resume.
DISADVANTAGE: Higher cognitive complexity and dependency overhead.
EVIDENCE: backend/agent/graph_a.py, backend/agent/state.py
```

```
DECISION: Server-Sent Events (SSE) vs. WebSockets
WHY: Agent telemetry is fundamentally unidirectional (server pushes state to client).
ALTERNATIVE: Full-duplex WebSockets.
ADVANTAGE: Operates over standard HTTP, zero custom connection handshakes, auto-reconnects natively, easily traverses corporate firewalls.
DISADVANTAGE: Cannot send client data upstream over the same channel (requires separate POST).
EVIDENCE: backend/api/sse.py, frontend/lib/sse.js
```

```
DECISION: Human-in-the-Loop Interrupt vs. Fully Autonomous Dispatch
WHY: False positive Jira creation and misassigned policy breaches damage enterprise trust.
ALTERNATIVE: 100% autonomous execution.
ADVANTAGE: Eliminates enterprise risk by giving managers the final veto on AI-reframed tasks.
DISADVANTAGE: Introduces human latency into the pipeline execution loop.
EVIDENCE: backend/agent/nodes/hitl_interrupt.py, backend/api/routes/hitl.py
```

```
DECISION: Custom Parallel Task Reducer vs. Default Last-Write-Wins
WHY: 4 parallel firewall checkers execute concurrently and return partial task state updates.
ALTERNATIVE: Sequential node execution or overwriting state dictionaries.
ADVANTAGE: Reduces wall-clock latency to max(checker_latencies) while preserving all non-null fields across sibling branches.
DISADVANTAGE: Requires custom deep-merging reducer logic.
EVIDENCE: backend/agent/state.py -> update_tasks_reducer()
```

---

# 21. DISTINCTIVE AI ENGINEERING FEATURES

| Feature | Why It Stands Out | AI Relevance (1-10) | Tech Depth (1-10) | Resume Value (1-10) | Interview Value (1-10) |
|---|---|---|---|---|---|
| **Parallel-Safe Task Reducer** | Solves state collisions in LangGraph fan-out using field-level deep merging | 9/10 | 10/10 | 10/10 | 10/10 |
| **Durable HITL Pause/Resume** | Halts graph via `interrupt()`, streams via SSE, resumes via `Command(resume=...)` | 10/10 | 9/10 | 10/10 | 10/10 |
| **Multi-Silo Agentic Firewall** | Combines SQL, 1024-dim pgvector RAG, and live Jira JQL in parallel | 9/10 | 9/10 | 9/10 | 9/10 |
| **Async Tracker Loop (Graph B)** | Closes Jira tickets via Slack/GitHub with finite turn-count loop guardrail | 9/10 | 8/10 | 9/10 | 9/10 |
| **Pydantic Schema Flattener** | Resolves `$defs` to force open-source LLM tool calling in Nvidia NIM | 8/10 | 8/10 | 8/10 | 9/10 |

---

# 22. MEASURABLE RESULTS

| Metric / Attribute | Verified Value in Codebase | Source / Evidence | Safe for Resume |
|---|---|---|---|
| **Orchestration Nodes** | 17 Total Nodes (12 in Graph A, 5 in Graph B) | `graph_a.py`, `graph_b.py` | ✅ YES |
| **Embedding Dimensions** | 1024 Dimensions (`nv-embedqa-e5-v5`) | `llm_client.py`, `migration.sql` | ✅ YES |
| **Firewall Dimensions** | 4 Silos (HR, Finance, Security, Jira Capacity) | Checker node source files | ✅ YES |
| **Context Window** | 1M+ Token Support (Gemini 2.5 Flash) | `extractor.py` | ✅ YES |
| **Loop Guardrail Cap** | Max 2 Clarification Turns (`turn_count >= 2`) | `graph_b.py`, `escalation.py` | ✅ YES |
| **SSE Keep-Alive** | 15-Second Heartbeat Interval | `api/sse.py` | ✅ YES |
| **Measured Latency / ROI** | None (Estimates only in README) | No benchmark scripts in repo | ❌ NO (Do not claim) |

---

# 23. SAFE RESUME CLAIMS MATRIX

### ✅ SAFE TO CLAIM
- Architected and built an enterprise meeting-to-execution system using dual LangGraph StateGraphs (12-node pipeline & 5-node async tracking loop).
- Engineered a parallel-safe dictionary reducer (`update_tasks_reducer`) in LangGraph to enable concurrent fan-out across 4 enterprise data checkers without state collisions.
- Designed a durable Human-in-the-Loop (HITL) gate using LangGraph `interrupt()`, checkpointer state serialization, and FastAPI background resumption.
- Integrated hybrid LLM architecture: Gemini 2.5 Flash for 1M-token transcript extraction and Nvidia Llama 3.1 70B for strict Pydantic tool-calling and policy reframing.
- Implemented real-time telemetry using Server-Sent Events (SSE) in FastAPI with per-thread queues, proxy keep-alive heartbeats, and a Next.js 14 dashboard.
- Built automated ETL connectors embedding corporate policies and budgets into Supabase pgvector using 1024-dimensional Nvidia embeddings with custom SQL cosine similarity RPCs.

### ⚠️ SAFE WITH CAREFUL WORDING
- *"Built for production readiness"* (Frame as architectural design patterns: idempotency guards, retry backoff, webhook HMAC verification, and checkpointer persistence).
- *"Automated Jira ticket lifecycle"* (Specify that ticket creation and status updates execute via Atlassian REST API v3).

### 🔍 VERIFY WITH ME (Candidate Context)
- Personal contributions during live demo presentations.
- Specific cloud environments where you ran the stack locally vs. remote servers.

### ❌ DO NOT CLAIM
- DO NOT claim "Deployed in production across 10,000 enterprise users" (No deployment infrastructure or production user database exists).
- DO NOT claim "Reduced meeting administrative time by 85%" as a measured benchmark (This is an ROI estimate from the README, not a measured empirical result).
- DO NOT claim "Built multi-agent autonomous negotiation" (The system is a deterministic workflow agent with tool-calling, not an open-ended autonomous swarm).

---

# 24. TOP RESUME BULLETS

1. **Dual-Graph LangGraph Architecture:**  
   *Architected a dual-graph enterprise AI orchestrator in LangGraph featuring a 12-node synchronous meeting ingestion pipeline and a 5-node asynchronous Slack/GitHub task tracking loop.*

2. **Parallel-Safe State Reducer:**  
   *Engineered a custom field-level state reducer (`update_tasks_reducer`) in LangGraph, enabling 4 concurrent firewall nodes to execute parallel SQL, vector RAG, and API evaluations without race conditions.*

3. **Durable Human-in-the-Loop Checkpointing:**  
   *Implemented a deterministic Human-in-the-Loop (HITL) approval gate using LangGraph `interrupt()` and checkpointer state serialization, allowing managers to review, reframe, and approve AI actions before dispatch.*

4. **Multi-Silo Enterprise Firewall:**  
   *Built an agentic policy firewall validating extracted tasks across Supabase HR records, 1024-dim pgvector budget and security embeddings, and live Atlassian Jira open-ticket workload queries.*

5. **Hybrid LLM & Structured Tool Calling:**  
   *Engineered a hybrid LLM strategy utilizing Google Gemini 2.5 Flash for 1M-context transcript extraction and Nvidia NIM Llama 3.1 70B with recursive schema flattening for strict Pydantic JSON validation.*

6. **Real-Time SSE Telemetry Engine:**  
   *Designed an asynchronous Server-Sent Events (SSE) streaming architecture in FastAPI with per-thread `asyncio` queues and 15-second proxy keep-alive heartbeats, powering a 4-panel real-time Next.js 14 dashboard.*

7. **Asynchronous Progress Tracking Loop:**  
   *Built an event-driven task tracking loop (Graph B) that parses informal Slack replies and GitHub push webhooks to automatically transition Jira tickets to Done or Blocked with a 2-turn loop guardrail.*

8. **Automated Vector ETL & Custom PostgreSQL RPCs:**  
   *Developed automated data connectors syncing Google Sheets budgets and PDF security manuals into Supabase pgvector using 1024-dim Nvidia embeddings and custom SQL cosine similarity RPC functions.*

9. **Deterministic Action Dispatcher:**  
   *Engineered an automated execution dispatcher interfacing with Atlassian Jira Cloud REST API v3 and Slack WebClient to create task tickets with provenance tags and send contextual DMs to assignees.*

10. **Resilient Webhook Infrastructure:**  
    *Implemented secure webhook ingestion for Slack Event API and GitHub push events with HMAC-SHA256 cryptographic signature validation, replay attack prevention, and non-blocking background task execution.*

---

# 25. SELECT FINAL 4–5 RESUME BULLETS

```
• Architected an enterprise AI Chief of Staff using dual LangGraph StateGraphs (12-node meeting pipeline & 5-node async tracking loop) to automate task extraction, policy validation, and ticketing dispatch.

• Engineered a parallel-safe dictionary reducer (`update_tasks_reducer`) in LangGraph, enabling 4 concurrent firewall nodes to query SQL records, 1024-dim pgvector embeddings, and Jira APIs in parallel without state collisions.

• Designed a durable Human-in-the-Loop (HITL) review gate using LangGraph `interrupt()` and checkpointer serialization, streaming state via FastAPI SSE to a Next.js 14 dashboard and resuming via `Command(resume=...)`.

• Implemented an asynchronous webhook tracking loop that semantically classifies Slack replies and GitHub commits via Nvidia Llama 3.1 70B to autonomously update Jira tickets with a 2-turn finite loop guardrail.

• Developed a hybrid LLM gateway combining Gemini 2.5 Flash for 1M-token transcript extraction and Nvidia NIM Llama 3.1 70B with recursive JSON schema flattening for guaranteed Pydantic output validation.
```

---

# 26. INTERVIEW ATTACK TREE & DEFENSE GUIDE

### Bullet 1: Dual-Graph LangGraph Architecture & Parallel Reducer
- **Q: Why did you split the system into Graph A and Graph B instead of one large graph?**  
  *Defense:* Graph A is synchronous, long-running, and HITL-gated (bound to a single meeting transcript lifecycle), requiring state checkpointing. Graph B is asynchronous, event-driven, and triggered by webhooks (Slack replies, Git pushes) days after the meeting. Combining them would create an unmaintainable state schema with conflicting lifecycle requirements.
- **Q: How does `update_tasks_reducer` prevent state loss during fan-in?**  
  *Defense:* In LangGraph, when parallel edges fan in, partial state dicts are merged. The default dictionary reducer replaces the entire key. My reducer operates at the field level: it iterates over incoming keys and only updates fields that are explicitly non-None. Thus, `hr_checker` updating `hr_status` and `security_checker` updating `security_flag` merge cleanly into the same `Task` object.

### Bullet 2: Human-in-the-Loop (HITL) & Checkpointer
- **Q: Exactly what happens under the hood when the graph hits the HITL node?**  
  *Defense:* `hitl_interrupt_node` calls `interrupt(interrupt_payload)`. LangGraph saves the execution state to `MemorySaver` (keyed by `thread_id`) and immediately halts execution. The FastAPI background task pushes a `hitl_ready` event over SSE and exits. The server process remains completely unblocked.
- **Q: How does the workflow resume when the manager approves?**  
  *Defense:* The Next.js frontend sends `POST /api/hitl-resume` with `thread_id` and the manager's decisions dictionary. FastAPI calls `graph_a.invoke(Command(resume=decisions), config={"configurable": {"thread_id": thread_id}})`. LangGraph looks up the checkpoint, injects `decisions` directly into the return value of `interrupt()`, and resumes execution through `state_update_node` to `dispatcher_node`.

### Bullet 3: Agentic Firewall & Vector RAG
- **Q: How did you implement the vector similarity search for security policies?**  
  *Defense:* I used Nvidia NIM's `nv-embedqa-e5-v5` model to generate 1024-dimensional embeddings of task descriptions and transcript quotes. These are queried against Supabase `security_policies` table using a custom SQL RPC function `match_security_policies` that computes cosine distance (`1 - (embedding <=> query_embedding)`). Matches exceeding a 0.50 threshold raise a security flag.
- **Q: Why query Jira live in `capacity_checker_node` instead of caching it in PostgreSQL?**  
  *Defense:* Workloads change dynamically in active engineering teams. The capacity checker executes a live JQL search (`assignee="{assignee}" AND status!=Done`) against Atlassian Jira Cloud REST API v3 to enforce strict workload limits (2 tickets for `NEW_HIRE`, 10 for regular employees).

### Bullet 4: Asynchronous Loop & Guardrails (Graph B)
- **Q: How do you prevent infinite message loops when an employee gives vague Slack updates?**  
  *Defense:* In Graph B, every clarification sent by `slack_dm_node` increments `state["turn_count"]`. In `route_intent()`, if the intent remains `AMBIGUOUS` and `turn_count >= 2`, the edge dynamically routes to `escalation_node`, which patches Jira to Blocked, tags the human manager in `#product-team`, and terminates the graph (`→ END`).

### Bullet 5: Structured Output & Schema Flattening
- **Q: Why did you build `_flatten_schema()` in the LLM client?**  
  *Defense:* Pydantic V2 schemas use `$defs` references for nested models. Nvidia NIM's OpenAI-compatible tool-calling engine frequently fails to resolve `$ref` pointers in JSON schema parameters. My helper recursively resolves and inlines all `$defs` definitions directly into a flat schema before submitting the tool definition, eliminating tool-calling rejection errors.

---

# 27. FINAL SUMMARY

### TOP 10 THINGS THAT MAKE VERIDIAN STAND OUT
1. **Parallel-Safe LangGraph Reducer:** Custom field-level deep merger solving fan-out race conditions.
2. **Deterministic HITL Pause/Resume:** Native checkpointer serialization using `interrupt()` and `Command(resume=...)`.
3. **Multi-Silo Agentic Firewall:** Parallel validation across SQL, 1024-dim pgvector RAG, and live Jira JQL.
4. **Asynchronous Progress Tracker (Graph B):** Webhook-driven event loop tracking work post-meeting.
5. **Finite Loop Guardrails:** Turn-counter thresholding preventing infinite Slack DM polling.
6. **Dynamic Jira Transition Resolution:** Runtime transition ID discovery matching project-specific workflow states.
7. **Robust Pydantic Schema Flattener:** Inlines `$defs` for flawless open-source model tool calling.
8. **Real-Time SSE Telemetry:** Non-blocking async queue manager with proxy keep-alive heartbeats.
9. **Idempotency Barrier:** Deduplicates webhook deliveries via PostgreSQL primary keys at $0 LLM cost.
10. **Provenance Auditing:** Every task carries verbatim transcript quotes and connector source timestamps.

### TOP 5 RESUME METRICS (SAFE & CODEBASE-VERIFIED)
1. **17 Total Orchestration Nodes** across 2 discrete LangGraph state machines.
2. **1024-Dimensional Semantic Vectors** using Nvidia NIM `nv-embedqa-e5-v5`.
3. **4-Tier Parallel Firewall** (HR status, Budget RAG, Security RAG, Jira capacity).
4. **1M+ Token Context Ingestion** supported via Google Gemini 2.5 Flash.
5. **Max 2-Turn Clarification Cap** enforced by Graph B loop guardrail.

### TOP 5 TECHNICAL FEATURES TO HIGHLIGHT
1. Custom LangGraph State Reducer (`update_tasks_reducer`).
2. Native Checkpointed HITL Interrupt & Resumption Architecture.
3. Hybrid Multi-Model Strategy (Gemini 2.5 Flash + Nvidia Llama 3.1 70B).
4. Unidirectional Server-Sent Events (SSE) Async Queue Pipeline.
5. Supabase pgvector RPC Cosine Similarity Search Engine.

### TOP 5 PRODUCTION-READINESS SIGNALS
1. **Idempotency Guard:** Prevents duplicate runs at `ingest_node`.
2. **HMAC Webhook Signatures:** Cryptographic verification for Slack and GitHub webhooks.
3. **Exponential Backoff:** 3-tier retry policy (2s, 4s, 8s) handling API 429/5xx errors.
4. **Dynamic API Transitions:** Runtime discovery of Jira status IDs.
5. **LangSmith Tracing:** Full telemetry across graph nodes and LLM invocations.

### TOP 5 INTERVIEW TOPICS I MUST MASTER
1. How `update_tasks_reducer` works under the hood during LangGraph fan-in.
2. The exact sequence of events during a LangGraph `interrupt()` and `Command(resume=...)` cycle.
3. Why Server-Sent Events (SSE) were selected over WebSockets for agent progress streaming.
4. The mechanics of 1024-dim pgvector cosine similarity search (`<=>`) in PostgreSQL RPCs.
5. How Graph B enforces loop guardrails on ambiguous human communications.

### TOP 5 CLAIMS TO AVOID
1. DO NOT claim measured enterprise ROI percentages (e.g. "Saved 85% PM time") as empirical benchmarks.
2. DO NOT claim multi-tenant cloud deployment on Kubernetes/AWS.
3. DO NOT claim open-ended autonomous agent swarms (it is a constrained workflow graph).
4. DO NOT claim automated unit test coverage percentages.
5. DO NOT claim Redis Pub/Sub is currently active in the codebase (it is an in-memory `asyncio.Queue`).

### MISSING INFORMATION I SHOULD VERIFY
- Ensure you have your personal Atlassian Jira and Slack test credentials configured if performing a live interview demo.
- Be prepared to discuss how you would swap `MemorySaver` to `PostgresSaver` for multi-worker production deployments.
