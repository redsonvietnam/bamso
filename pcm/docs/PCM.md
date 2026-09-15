# Protocol for Canonical Management (PCM)

**Version:** 1.0 (Canonical)  
**Status:** Approved — PCM-GATE-01  
**Authority:** External Authority Gate  

## 1. Purpose

PCM defines the constitutional protocol for managing work in any context. It establishes invariants, primitives, and role semantics that remain valid regardless of tools, environments, or specific implementations.

PCM is not a workflow manual. It is the minimal set of rules that prevent specific classes of failure in coordinated work.

## 2. Scope

PCM governs:
- The relationship between proposed and canonical state
- Authority boundaries and delegation
- The separation of execution from approval
- Context reconstruction across actors and sessions

## 3. Non-Scope

PCM does not define:
- Specific tools, technologies, or platforms
- Workflow steps or execution procedures
- Implementation details or runtime behavior
- Environment-specific bindings
- How routing, observation, or verification are implemented

## 4. Core Primitives

PCM defines four primitives. These are the only first-class concepts in the protocol.

### 4.1 WORKSTREAM
A bounded unit of work with a defined purpose, authority scope, and completion criteria.

### 4.2 TASK
A specific action or set of actions within a workstream that contributes to the workstream's purpose.

### 4.3 HANDOFF
The transfer of context, authority, and responsibility between execution actors. A HANDOFF is the mechanism by which work becomes reconstructable by a different actor.

### 4.4 GATE
A verification point where proposed state is evaluated against defined criteria before becoming canonical. A GATE is the only mechanism by which proposed state becomes canonical.

## 5. Execution Actor

An execution actor is any entity capable of performing work under PCM governance. PCM does not define what an actor IS — only what an actor CAN DO within the protocol.

An actor's capabilities are described by:
- **Model:** What the actor can reason about
- **Tools:** What instruments the actor can use
- **State-access:** What persistent state the actor can read/write
- **Permissions:** What actions the actor is authorized to perform
- **Resource-limits:** What constraints the actor operates under

**Critical distinction:** An actor may have strong state-access (can read/write persistent state) while having weak actor-memory (little or no session history). These are independent dimensions.

PCM does not require a specific number of actors. The protocol functions with one actor or many.

## 6. Role Semantics

Roles are contextual assignments, not permanent positions. The same actor may hold different roles at different times.

### 6.1 AUTHORITY
The role with decision-making power over canonical state for a defined scope. Authority must be explicitly delegated and cannot be self-assumed.

### 6.2 PROPOSER
The role that suggests changes to canonical state. Proposals require AUTHORITY approval before becoming canonical.

### 6.3 OPERATOR
The role that executes tasks. Operators work under AUTHORITY delegation.

### 6.4 OBSERVER
The role that monitors and reports on work state without modification power.

## 7. Invariants

The following invariants are absolute. Each prevents a specific class of failure.

### 7.1 Agent ≠ Authority
**Prevents:** Execution capability creating canonical decision authority.

An actor that executes work does not thereby obtain AUTHORITY over that work's canonical outcome. Authority must be delegated from a separate source or explicitly granted through a defined governance mechanism.

A single actor may hold multiple execution roles (e.g., PROPOSER + OPERATOR). However, execution capability alone does not create canonical decision authority. If a single actor operates in an AUTHORITY role, that authority must derive from an explicit governance mechanism (e.g., external delegation, organizational policy, or a defined self-governance protocol) — not from being the sole actor.

### 7.2 Implementation ≠ Approval
**Prevents:** Executed work being treated as approved work.

Completing a task does not constitute approval of its outcome. AUTHORITY approval is a separate action from execution.

### 7.3 Proposed State ≠ Canonical State
**Prevents:** Unreviewed changes becoming permanent.

Proposed changes are always provisional. They become canonical only through GATE approval. No amount of implementation, time passing, or actor effort converts proposed state to canonical state without explicit AUTHORITY action.

### 7.4 Context ≠ Canonical State
**Prevents:** Session-specific information overriding persistent truth.

Working state, memory, or session context is never canonical. Canonical state exists only in persistent, authoritative storage that survives session boundaries.

### 7.5 Protocol ≠ Tooling
**Prevents:** Tool changes altering protocol semantics.

PCM rules are independent of specific tools. Changing tools, platforms, or environments does not alter what the protocol requires or permits.

### 7.6 Concurrent Conflict ≠ Silent Resolution
**Prevents:** Conflicting proposals silently resolving through timing or actor preference.

When multiple actors submit conflicting proposals for the same canonical state:
- Neither proposal becomes canonical by virtue of being first, last, or implemented
- AUTHORITY must explicitly select, reject, or merge proposals
- AUTHORITY latency (delay in responding) never implies approval
- Unresolved conflicts remain unresolved until explicitly resolved

## 8. State Model

PCM distinguishes four state categories:

### 8.1 Canonical State
The authoritative, persistent representation of project state. Only AUTHORITY can modify canonical state through GATE approval. Canonical state is what any actor should treat as "what is actually true."

### 8.2 Proposed State
Suggested changes to canonical state. Always provisional. Multiple conflicting proposals may exist simultaneously. Proposed state becomes canonical only through GATE.

### 8.3 Execution State
Runtime context of active work. Temporary and not canonical. Execution state may be lost without affecting canonical state.

### 8.4 Context State
Session-specific information, memory, or working context. Not canonical. Different actors may have different context state for the same work.

**State Transitions:**
- Proposed → Canonical: Only through GATE with AUTHORITY approval
- Canonical → Proposed: New proposal to modify current canonical state
- Execution State: Created during task execution, discarded after completion
- Context State: Created during sessions, not persisted unless explicitly handed off

## 9. HANDOFF Semantics

A HANDOFF must include:
- Current canonical state reference
- Pending proposals (if any)
- Execution context
- Authority delegation (if applicable)
- Evidence of progress
- Next action recommendation

A HANDOFF must contain sufficient information to reconstruct the relevant work context together with whatever canonical state is referenced. The canonical state reference must be resolvable through the applicable persistence mechanism. A HANDOFF does not need to duplicate the entire canonical state.

The principle remains: context memory from the previous session must not be required. A different actor should be able to continue work using the HANDOFF and the referenced canonical state, without needing memory of previous sessions.

HANDOFFs do not transfer AUTHORITY automatically. Authority transfer requires explicit delegation within the HANDOFF.

## 10. GATE Semantics

A GATE is a verification point where:
1. Proposed state is evaluated against defined criteria
2. AUTHORITY reviews and decides
3. Approved state becomes canonical
4. Rejected state is documented with rationale

GATEs prevent:
- Self-approval of work
- Silent drift from canonical state
- Unverified changes becoming permanent
- Conflicting proposals silently resolving

## 11. Authority Semantics

### 11.1 Authority Source
Authority derives from explicit delegation, not from execution capability, role assumption, or temporal proximity to work.

### 11.2 Authority Boundaries
Authority is bounded by:
- Workstream scope
- Delegation terms
- Expiration (if defined)

### 11.3 Authority Transfer
Authority transfers only through explicit HANDOFF with AUTHORITY delegation.

### 11.4 Authority Resolution
When authority is ambiguous or contested:
- The contested state remains as-is (no silent resolution)
- Escalation to a higher authority scope is the resolution mechanism
- Authority latency never implies implicit approval

## 12. Evidence Provenance

Evidence produced during work has provenance. This is a semantic requirement that supports informed decision-making, not an invariant.

PCM distinguishes three categories of evidence provenance:

### 12.1 Self-Reported
Evidence produced by the actor performing the work. Valid for progress tracking but may require independent verification for GATE decisions.

### 12.2 Independently Produced
Evidence produced by a different actor than the one performing the work. Stronger basis for GATE decisions.

### 12.3 Automatically Observed
Evidence produced by automated systems or tooling. Strength depends on the reliability of the observation mechanism.

PCM does not assume all self-reported evidence is invalid. It requires that evidence provenance be inspectable so that AUTHORITY can make informed decisions about what level of evidence is appropriate for a given GATE.

## 13. Relationship Between Protocol and Implementation

### 13.1 Protocol Independence
PCM rules remain valid regardless of implementation. Changing tools, environments, or actors does not alter PCM semantics.

### 13.2 Implementation Conformance
Implementations demonstrate conformance by adhering to PCM invariants, not by adopting specific implementations.

### 13.3 Adapter Boundary
Project-specific behavior belongs in adapters, not in PCM core. Adapters bind PCM to specific contexts while preserving core semantics.

## 14. Coordination Cost

PCM does not mandate a maximum number of actors, hops, or coordination steps. Instead:

- Coordination cost should be observable
- Unnecessary handoffs should be visible
- The shortest capable execution path should be preferred
- Actors should be added only when capability, verification, or authority gain justifies the coordination cost

Numeric limits, if needed, belong to policy and evidence, not PCM invariants.

## 15. Applicability Test

PCM remains valid if work were performed:
- Without GitHub or any specific platform
- Without any specific tool
- Without any specific language
- Without any specific framework
- With a single actor or many actors

The protocol governs relationships and state management, not implementations.

## 16. Versioning

PCM versions follow semantic versioning:
- Major: Incompatible changes to invariants or primitives
- Minor: Compatible additions or clarifications
- Patch: Corrections or editorial changes

## 17. Authority

This specification is PROPOSED and pending external Authority Gate review. It does not represent canonical state until approved through proper GATE procedures.
