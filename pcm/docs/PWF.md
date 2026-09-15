# Protocol Workflow Framework (PWF)

**Version:** 1.0 (Canonical)  
**Status:** Approved — PCM-GATE-01  
**Authority:** External Authority Gate  

## 1. Purpose

PWF defines how PCM-governed work is normally executed. It provides the execution framework above PCM, translating protocol invariants into operational patterns.

PWF is project-agnostic, tool-agnostic, and model-agnostic. It defines behavior patterns, not specific implementations. PWF is valid with a single actor or many actors.

## 2. Scope

PWF governs:
- Task representation and lifecycle
- Execution patterns for PCM-governed work
- Verification and handoff mechanics
- Recovery from interruptions

## 3. Non-Scope

PWF does not define:
- Specific tools or technologies
- Project-specific workflows
- Runtime implementations
- Environment bindings
- Domain-specific procedures
- How routing is performed
- How observations are structured

## 4. Mandatory Behavior

The following behaviors are mandatory for PWF conformance.

### 4.1 Task Record

Every task must be representable as a record containing:
- Workstream reference
- Task purpose
- Authority delegation scope
- Success criteria
- Evidence requirements

The task record is the minimal unit of work tracking. Its format is implementation-specific.

### 4.2 Task Lifecycle

Tasks follow a lifecycle with at minimum these states:
1. **PROPOSED** — Task suggested, pending authority
2. **AUTHORIZED** — Task approved by authority
3. **EXECUTING** — Task actively being worked
4. **COMPLETED** — Task execution finished, success criteria satisfied
5. **REJECTED** — Task rejected (with rationale)

Additional states (e.g., BLOCKED, SUSPENDED) are permitted but not required.

Transitions between states must be explicit. State cannot change without a defined trigger.

**Critical distinction:** Task COMPLETED means the task's execution/success criteria are satisfied according to task semantics. Task COMPLETED does NOT imply:
- GATE approval
- Canonical-state promotion
- Implementation approval

A task may be COMPLETED while any associated proposed state remains PROPOSED / PENDING GATE. Only GATE approval with AUTHORITY action promotes proposed state to canonical. Not every task requires a GATE — only tasks that change canonical state require GATE approval.

### 4.3 Handoff

When work transfers between actors, the handoff must satisfy PCM HANDOFF semantics (PCM section 9). The handoff is the mechanism that makes work reconstructable.

PWF does not redefine HANDOFF. PWF requires that handoffs conform to PCM HANDOFF semantics.

### 4.4 GATE Support

PWF must support GATE verification at appropriate points. The GATE is the only mechanism by which proposed state becomes canonical (PCM section 10).

PWF does not redefine GATE. PWF requires that GATEs conform to PCM GATE semantics.

### 4.5 State Traceability

At any point, an actor must be able to determine:
- What is the current canonical state
- What proposals exist
- What authority has been delegated
- What evidence exists for claimed progress

This does not require a specific implementation. It requires that the information be retrievable.

## 6. Recommended Behavior

The following behaviors are recommended but not mandatory.

### 6.1 Checkpoints

Regular checkpoints help maintain continuity:
- Progress against success criteria
- Authority alignment
- Context freshness
- Evidence completeness

### 6.2 Next Action Determination

When determining next action:
- Consider current canonical state
- Review pending proposals
- Assess capability requirements
- Evaluate authority boundaries
- Check for blockers or dependencies

### 6.3 Observation Principle

Repeated or evidenced observation should precede protocol-changing action, with AUTHORITY where required.

This is a principle, not a lifecycle. Implementations may structure observations as they see fit, provided the principle is honored.

### 6.4 Evidence Collection

Evidence should be collected in a way that:
- Supports the decision at hand
- Has inspectable provenance (PCM section 12)
- Is proportionate to the significance of the decision

## 7. Optional / Pluggable Behavior

The following behaviors are implementation-specific. PWF does not mandate how these are performed.

### 7.1 Routing

How execution actors are selected or reassigned. PWF is valid when:
- One actor is available
- Routing is static
- Routing is manually selected
- Routing is dynamic

Routing decisions should be traceable where meaningful.

### 7.2 Verification Selection

How verification methods are chosen:
- Automated checks
- Manual review
- Peer verification
- Authority approval

### 7.3 Recovery

How work recovers from interruptions:
- State reconstruction from persistent state
- Context restoration from handoffs
- Authority re-establishment
- Progress revalidation

### 7.4 Observation Structure

How observations are recorded and lifecycle-managed. The observation principle (6.3) is recommended; the specific structure is optional.

## 8. State Relationship: Drift and Reconciliation

Drift is not a separate concept. It is a property of the relationship between proposed state and canonical state.

### 8.1 Drift Indicators
- Proposed state diverging from canonical
- Context stale relative to canonical state
- Authority assumptions without delegation
- Evidence gaps in progress

### 8.2 Reconciliation
When drift is detected:
1. Assess drift significance
2. Determine reconciliation approach
3. Execute reconciliation
4. Verify alignment restored

Drift detection and reconciliation mechanisms are adapter-specific. The semantic requirement is that stale claims can be invalidated by actual state.

## 9. Stop Conditions

Work must stop when:
- Authority revoked or expired
- Success criteria unachievable
- Ethical boundaries crossed
- Resource limits exceeded
- Better alternatives discovered

## 10. Escalation

Escalation occurs when:
- Authority boundary encountered
- Capability requirement exceeds available
- Conflict between invariants
- Recovery mechanism insufficient

Escalation is the act of surfacing a decision beyond the current authority boundary. Escalation itself does NOT create, grant, or transfer authority.

Actual authority transfer must happen only through the explicit authority mechanism defined by PCM (PCM section 11). Escalation may request resolution by an already-authorized higher authority, or initiate an explicit authority delegation — but escalation alone does not constitute authority transfer.

## 11. Single-Actor Validity

PWF functions with a single actor. When only one actor exists:
- That actor may hold multiple execution roles (PROPOSER + OPERATOR)
- AUTHORITY over canonical outcomes must still derive from an explicit governance mechanism, not from being the sole actor
- GATE semantics still apply: proposing and approving must be distinct, traceable actions even when performed by the same actor
- Handoffs may be to self (for session reconstruction)

The protocol does not require multiple actors to be meaningful. However, execution capability alone does not create canonical decision authority, regardless of how many actors exist.

## 12. Versioning

PWF versions follow semantic versioning:
- Major: Incompatible changes to mandatory behavior
- Minor: Compatible additions or clarifications
- Patch: Corrections or editorial changes

## 13. Authority

This specification is PROPOSED and pending external Authority Gate review. It does not represent canonical state until approved through proper GATE procedures.
