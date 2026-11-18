# CodeCage: A Secure Sandboxed Code Execution Platform Using Rootless Podman Containers

**Course:** 21CSE216P – Linux and Container Technologies
**Project type:** Group final project (Project Based Learning, CLA-2)

> This document defines **what** the project must achieve: its purpose, scope, requirements and deliverables. It does not prescribe implementation choices (languages, frameworks, specific commands or code structure). Those are left to the team.

---

## 1. Problem Statement

Online coding platforms, programming assignment graders and interview tools all have to run code written by people they cannot trust. That code may be buggy (infinite loops, memory leaks) or deliberately malicious (deleting files, opening network connections, fork bombs, reading secrets). Running it directly on a server puts the host machine, its data and every other user at risk.

The project must show that **containers can provide strong, lightweight isolation** for running untrusted code. Each execution must be contained, limited and disposable, so that nothing a submission does can affect the host or other submissions.

---

## 2. Project Goal

Build a platform where a user submits source code (and optional input), the system runs it inside an **isolated, short-lived, rootless Podman container** with strict restrictions, and the user gets back the program's output and an execution verdict. The container is destroyed afterwards, leaving no trace.

---

## 3. Objectives

1. Show the **full container lifecycle** (create → run → collect results → destroy) for every submission.
2. Apply **container security best practices**: rootless execution, least privilege, network isolation and filesystem restrictions.
3. Enforce **resource limits** (CPU, memory, process count, execution time) so that badly behaved code is stopped safely.
4. Build and maintain **custom container images** for each supported language runtime.
5. **Prove the isolation works** through a documented set of attack and abuse test cases.
6. Package the platform itself as a **multi-container application**.

---

## 4. Scope

### 4.1 In Scope

- Accepting code submissions in **at least two programming languages** (for example Python and C/C++, or Java).
- Accepting optional standard input (stdin) for a submission.
- Running each submission in its **own fresh, isolated container**.
- Returning output, errors and a clear verdict for each run.
- Enforcing security restrictions and resource limits on every execution container.
- Custom, minimal runtime images for each supported language.
- A simple user-facing interface (web page or CLI) for submitting code and viewing results.
- A security test suite that shows the sandbox holds up against common abuse cases.
- Containerised deployment of the platform's own components (interface, backend, storage).

### 4.2 Out of Scope

- **Live resource-monitoring dashboards, graphs or alerting.** That belongs to the ContainerWatch / ContainerPulse projects. CodeCage *enforces* limits; it does not *monitor* containers.
- **Network diagnostics tooling** (NetScope's area).
- **Image vulnerability scanning or auditing** (the Image Security Auditor's area).
- User accounts, logins, contests, leaderboards or plagiarism detection.
- Machine learning features of any kind.
- Production-scale load handling.

---

## 5. Functional Requirements

### FR-1: Code Submission
- The user can choose a language, enter or upload source code, and optionally provide stdin.
- The system rejects empty submissions, unsupported languages and submissions above a defined size limit, with a clear message.

### FR-2: Isolated Execution
- Every submission runs in a **new container created only for that submission**.
- No two submissions ever share a container, filesystem or process space.
- Compiled languages must support a compile step, and compile errors must be reported separately from runtime errors.

### FR-3: Result Reporting
For every run, the system returns:
- Standard output and standard error (both truncated to a defined maximum size)
- Exit status
- Time taken
- A **verdict**, from at least the following set:

| Verdict | Meaning |
|---|---|
| Success | Program ran and exited normally |
| Compilation Error | Code failed to compile |
| Runtime Error | Program crashed or exited with an error |
| Time Limit Exceeded | Program ran longer than the allowed time |
| Memory Limit Exceeded | Program tried to use more memory than allowed |
| Security Violation / Blocked | Program attempted a restricted action that was stopped |

### FR-4: Cleanup
- The execution container and all its temporary data are **removed after every run**, whether it succeeded, failed, timed out or was killed.
- No leftover containers, files or processes may build up on the host over time.

### FR-5: Multiple Language Runtimes
- Each supported language has its **own dedicated, minimal container image**.
- Images are built from the team's own image definition files (Dockerfile/Containerfile) and stored in a container registry (local or remote).
- Images contain only what is needed to compile/run that language: no unnecessary tools, shells or packages beyond the minimum.

### FR-6: Submission History (basic)
- The platform keeps a record of past submissions (code, language, verdict, time) that **persists across platform restarts**.

### FR-7: Concurrent Submissions
- The platform handles several submissions arriving at the same time without them interfering with each other, up to a defined concurrency limit. Excess submissions are queued or rejected cleanly.

---

## 6. Security and Isolation Requirements

These are the core of the project. Every execution container **must**:

| ID | Requirement |
|---|---|
| SR-1 | Run **rootless**: the platform must not need root privileges on the host to execute code |
| SR-2 | Run the submitted program as an **unprivileged, non-root user** inside the container |
| SR-3 | Have **no network access** of any kind |
| SR-4 | Have a **memory limit**; exceeding it ends the run |
| SR-5 | Have a **CPU limit**, so one submission cannot starve the host |
| SR-6 | Have a **process/PID limit**, so fork bombs are contained |
| SR-7 | Have a **wall-clock time limit**; overrunning submissions are killed |
| SR-8 | Have a **read-only filesystem** except for a small, size-limited scratch area |
| SR-9 | Have **no access to host files**, other submissions' files or platform secrets |
| SR-10 | Run with **all unnecessary privileges and capabilities removed**, with no way to gain new privileges |
| SR-11 | Have **output size limits**, so a program printing endlessly cannot exhaust disk or memory |

---

## 7. Security Test Suite (Proof of Isolation)

The team must prepare and run a set of **deliberately malicious or abusive submissions** and record that each one is contained. At minimum:

| # | Attack / Abuse Case | Expected Outcome |
|---|---|---|
| 1 | Infinite loop | Killed at time limit → *Time Limit Exceeded* |
| 2 | Allocating huge amounts of memory | Stopped → *Memory Limit Exceeded* |
| 3 | Fork bomb | Contained by process limit; host stays responsive |
| 4 | Opening a network connection / downloading a file | Fails, no network available |
| 5 | Reading host files (e.g. system password file, home directory) | Not reachable |
| 6 | Deleting or modifying system files | Fails, read-only filesystem |
| 7 | Filling up the disk with a large file | Stopped by scratch-area size limit |
| 8 | Printing endless output | Output truncated; run ends safely |
| 9 | Trying to gain root / escalate privileges | Fails |
| 10 | One submission trying to see or affect another running submission | No visibility, no effect |

For each case, the report must record: the test code (described), the expected result, the actual result, and evidence (screenshot or log).

---

## 8. Platform Deployment Requirements

- The platform's own components (for example: user interface, backend/API, submission storage) must each run **in containers**.
- The components must be deployable together as a **multi-container application** using a single compose/pod definition.
- Containers must communicate over a **defined container network**. The execution sandboxes must stay **separate from** this network (see SR-3).
- Submission history must live on **persistent storage** (volume or bind mount) that survives the platform being restarted or recreated.
- The whole platform must be startable on a fresh RHEL/Fedora-type Linux machine with Podman installed, by following the documentation.
- **Optional extension:** deploy the platform's own components on OpenShift/Kubernetes (Unit 5). The execution sandbox must still keep its isolation guarantees there.

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | A simple "Hello World" submission should return results within a few seconds |
| Reliability | A crashing or killed submission must never crash the platform itself |
| Resource safety | The host must stay responsive during every test case in Section 7 |
| Usability | Verdicts and error messages must be understandable by a beginner programmer |
| Maintainability | Adding a new language should mean adding a new runtime image plus configuration, without redesigning the system |
| Logging | The platform keeps logs of each execution (submission ID, language, verdict, duration) for debugging |

---

## 10. Syllabus Mapping

| Course Unit | How CodeCage covers it |
|---|---|
| Unit 1: Linux basics | Users and permissions, file system restrictions, process concepts, shell tooling |
| Unit 2: Containers & Podman | Rootless Podman, container lifecycle (create/run/stop/remove), basic commands |
| Unit 3: Images & registries | Custom per-language runtime images, minimal image best practices, pushing/pulling from a registry |
| Unit 4: Advanced usage | Security best practices, resource limits, networking (platform network vs. no-network sandboxes), persistent volumes, logs/debugging, multi-container compose |
| Unit 5: OpenShift/Kubernetes | Optional: deploying platform components on OpenShift |

| Course Outcome | Coverage |
|---|---|
| CO-1 | Linux system operations, users, permissions |
| CO-2 | Podman architecture, rootless mode |
| CO-3 | Building and optimising container images; registries |
| CO-4 | Running, networking and troubleshooting containers |
| CO-5 | Optional OpenShift deployment |

---

## 11. Deliverables

1. **Working platform**: deployable with Podman, with at least two languages supported.
2. **Source repository**: all code, image definition files and the compose/pod definition.
3. **Security test suite**: the abuse submissions from Section 7 with recorded results.
4. **Project report** containing:
   - Problem statement and objectives
   - System architecture diagram (components, networks, storage, sandbox lifecycle)
   - Description of each security measure and the threat it addresses
   - Image design decisions (size, contents, base choice)
   - Security test results with evidence
   - Limitations and future scope
5. **Setup / user guide**: how to deploy, run and use the platform on a fresh machine.
6. **Live demonstration** for the viva (see Section 12).
7. **Presentation slides** for the viva.

---

## 12. Demonstration Plan (for Viva)

The live demo should show, in order:

1. Starting the whole platform with a single command.
2. A normal submission in each supported language, returning *Success*.
3. A compile error and a runtime error, each with the correct verdict.
4. A selection of the attack cases from Section 7 (infinite loop, fork bomb, network access, host file read), each safely contained, with the host still responsive.
5. Showing that no leftover containers remain after the runs.
6. Restarting the platform and showing that submission history persisted.

---

## 13. Success Criteria

The project is complete when:

- [ ] Code in at least two languages can be submitted and executed with correct verdicts
- [ ] Every execution happens in a fresh, rootless, isolated container that is removed afterwards
- [ ] All security requirements SR-1 to SR-11 are met
- [ ] All 10 test cases in Section 7 are contained, with evidence recorded
- [ ] The platform runs as a multi-container application with persistent submission history
- [ ] Concurrent submissions do not interfere with each other
- [ ] The report, setup guide and slides are complete
- [ ] The live demo runs end-to-end without manual fixes

---

## 14. Possible Future Scope (mention in report, not required)

- Test-case-based grading (compare output against expected output)
- More languages
- Deployment of the execution layer on OpenShift/Kubernetes with job-based sandboxes
- Stronger isolation layers (for example syscall filtering profiles or gVisor-style sandboxes)
- User accounts and assignment management for classroom use
