# `CLAUDE.md`

```markdown
# Abdulrahman Bahjat Portfolio — AI Agent Development Guide

This project is an **interactive space-themed engineering portfolio** built as a static web application.

The portfolio presents projects as **planets orbiting a star**, where:

- **Star** = Abdulrahman Bahjat (personal core)
- **Planets** = projects
- **Orbit system** = navigation structure

Visitors begin on a **small rocky planet near the star**, then launch into space and explore the solar system.

The experience is designed to feel like **navigating a calm engineering navigation system**, not a video game.

This repository is optimized for **AI-assisted development**, and agents are expected to follow the guidelines below.

---

# Core App Goals

The portfolio should feel:

- cinematic but minimal
- interactive but intuitive
- technically elegant
- performant and lightweight

Avoid:

- cluttered UI
- excessive animation
- game-like mechanics
- complex state systems

Prefer **simple architecture with clear responsibilities.**

---

# Architecture Overview

The site contains three primary experience stages:

### 1. Intro Planet Scene
User begins on a **small rocky planet orbiting close to a star**.

Visible elements:
- astronaut on the surface
- spacecraft nearby
- large star dominating the sky
- faint orbit lines and distant planets

Menu options appear visually aligned with the star:

- About
- Projects
- Skills
- Resume
- Contact

This planet is **not selectable** and only serves as the starting location.

---

### 2. Launch Transition

Selecting the entry option triggers a cinematic sequence:

1. spacecraft engines ignite
2. ship lifts off
3. camera rises from planet surface
4. planet shrinks below
5. solar system fades into view
6. camera settles into orbit view

---

### 3. Solar System Navigation

The solar system contains:

- central star
- orbit rings
- project planets

Interactions:

- click planet → zoom to project
- click star → enter personal section

Planets may encode meaning:

- size = project scale
- color = category
- rings = featured project
- moons = technologies used

---

# Development Philosophy

Follow these principles:

### Simplicity First
Prefer simple solutions.

### Minimal Surface Area
Change only what is necessary.

### Clear Naming
Use descriptive variable and function names.

### Motion Should Be Calm
Animations should feel smooth and deliberate.

### Avoid Over-Engineering
Do not introduce complexity without strong reason.

---

# Development Workflow

When performing non-trivial work (3+ steps):

1. Enter **planning mode**
2. Write a clear plan before coding
3. Execute tasks incrementally
4. Verify each step works

If something breaks:

STOP  
Re-evaluate the plan  
Then proceed

---

# Testing and Verification

Never mark a task complete without verifying it works.

Validation steps:

- run the app
- interact with the UI
- inspect console output
- confirm no runtime errors

Always verify behavior **visually and functionally**.

---

# UI Testing with Playwright MCP

Use the **Playwright MCP server** for interacting with the running app.

This is especially useful for:

- UI verification
- testing navigation
- confirming animations trigger correctly
- capturing screenshots

Preferred tools:

- `browser_take_screenshot`
- `browser_console_messages`
- UI interaction tools

Do not rely on static assumptions when UI behavior can be tested directly.

---

# Debugging Strategy

Debugging is a major part of development.

When something fails:

1. Inspect browser console
2. Identify stack trace
3. Locate the failing component
4. isolate the root cause
5. implement the minimal fix

Avoid speculative fixes.

Always verify the root cause.

---

# Project Content System

Portfolio data is stored in a **single JSON data structure**.

An admin interface allows editing this data and exporting an updated JSON file.

The site remains **fully static**.

Agents should preserve this design.

Do not introduce server dependencies.

---

# Optional Visual Modes

Admin panel includes toggles such as:

- schematic grid overlay
- alternate background modes

These features must remain optional and lightweight.

---

# Easter Eggs

Several hidden features exist.

Examples:

### Hidden Flight Mode
Allows users to pilot a ship through the solar system.

### Death Star Discovery
Flying far enough reveals a distant Death Star-like object.

Reaching it unlocks a **Millennium Falcon style ship**.

### Alternate Launch Cutscene
Holding a secret key combination during launch triggers a comedic alternate launch animation.

These features must **never interfere with the primary portfolio experience.**

---

# Hidden Constellation Signature

The starfield includes a faint constellation forming the letters:

A B

This is a subtle signature and should remain difficult to notice.

---

# Self-Improvement Loop (Agent Learning)

Agents must maintain a **continuous improvement process.**

Whenever:

- a bug is fixed
- code is corrected
- a design mistake is identified

the agent must update:

```

tasks/lessons.md

```

Each entry should include:

- problem encountered
- root cause
- correct pattern
- rule to avoid repeating the mistake

Example:

```

## Lesson: Animation State Bug

Problem:
Animation triggered repeatedly due to missing state guard.

Root Cause:
Component re-render caused effect to re-execute.

Correct Pattern:
Guard animation triggers with a persistent state flag.

Rule:
Never trigger cinematic sequences inside render cycles.

```

Agents should review this file before starting new work.

---

# Task Management

All significant tasks should be tracked in:

```

tasks/todo.md

```

Workflow:

1. Write task plan
2. Implement steps
3. Mark progress
4. Document results
5. Capture lessons learned

---

# Preferred Code Style

Prefer:

- readable functions
- small focused modules
- self-explanatory names

Avoid:

- heavy comments
- overly abstract architectures
- hidden behavior

Good code should **explain itself.**

---

# Final Guideline

Always ask:

> Would a senior engineer consider this solution clean, stable, and maintainable?

If the answer is no, improve the design before continuing.
