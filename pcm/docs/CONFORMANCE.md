# PCM/PWF Conformance Specification

**Version:** 1.0 (Canonical)  
**Status:** Approved — PCM-GATE-01  
**Authority:** External Authority Gate  

## 1. Purpose

This document defines how implementations or adapters demonstrate conformance to PCM and PWF. Conformance is based on observable behavior, not internal claims.

## 2. Conformance Levels

### 2.1 Level 1: PCM-Core-Conformant

**Required Semantics:**
- All six PCM invariants hold (7.1–7.6)
- Four primitives are representable (WORKSTREAM, TASK, HANDOFF, GATE)
- Four roles are distinguishable (AUTHORITY, PROPOSER, OPERATOR, OBSERVER)
- State model is maintained (Canonical, Proposed, Execution, Context)
- Authority is explicit and resolvable
- Evidence provenance is inspectable

**Required Evidence:**
- Observable tests for each PCM invariant (Group A tests)
- State transition tests (Group B tests)
- Handoff reconstruction tests (Group C tests)
- Evidence provenance tests (Group D tests)

**What Is NOT Required:**
- PWF mandatory behaviors
- Task lifecycle implementation
- Adapter-specific behaviors
- Routing implementation
- Specific technology choices

### 2.2 Level 2: PWF-Conformant

**Required Semantics:**
- All PCM-Core semantics
- Task record with required fields
- Task lifecycle with explicit transitions
- Task COMPLETED ≠ approval
- GATE support for canonical-state changes
- State traceability

**Required Evidence:**
- All PCM-Core evidence
- Task lifecycle tests (Group F tests)
- Concurrency tests (Group E tests)
- GATE integration tests

**What Is NOT Required:**
- Adapter-specific behaviors
- Specific routing algorithms
- Specific verification methods
- Specific persistence mechanisms

### 2.3 Level 3: Adapter-Conformant

**Required Semantics:**
- All PWF-Conformant semantics
- Domain-appropriate behaviors
- Core preservation (adapter does not violate PCM invariants)

**Required Evidence:**
- All PWF-Conformant evidence
- Domain-specific test scenarios
- Core preservation verification

**What Is NOT Required:**
- Specific API implementations
- Specific technology choices
- Specific tool integrations

## 3. Test Groups

Structured conformance tests are organized into six groups:

- **Group A — Authority** (8 tests): Authority integrity, escalation, transfer
- **Group B — State** (8 tests): Proposed/canonical separation, drift detection
- **Group C — Handoff** (6 tests): Reconstruction, stale detection, authority transfer
- **Group D — Evidence** (4 tests): Provenance inspection, classification
- **Group E — Concurrency** (6 tests): Proposal conflicts, resolution
- **Group F — Task/PWF** (10 tests): Task lifecycle, routing, recovery

See `conformance/scenarios/` for detailed test specifications.

## 4. Conformance Assessment

### 4.1 Evidence Requirements
- Observable behavior supporting each criterion
- Test results documenting pass/fail
- Exceptions or limitations noted
- Evidence provenance visible

### 4.2 Conformance Statement
- Declares conformance level (PCM-Core, PWF, or Adapter)
- Lists criteria evaluated
- Notes exceptions or limitations
- References specific test results

### 4.3 Limitations
Conformance does not guarantee:
- Correctness of implementation
- Suitability for specific purposes
- Complete coverage of all scenarios
- Future compatibility
- Universal proof of maturity

## 5. Versioning

Conformance specifications follow PCM versioning:
- Major: Changes to conformance requirements
- Minor: Additions or clarifications
- Patch: Corrections or editorial changes

## 6. Authority

This specification is CANONICAL as part of PCM/PWF v0.2 baseline approved by PCM-GATE-01.
