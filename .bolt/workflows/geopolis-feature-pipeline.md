---
description: Mandatory workflow for adding any new module or system to the engine using the 5-step process (ECS and DDD)
---

# Step 1 - Architecture and Modeling
I will request the creation of a new system for the engine (e.g., Fuel System, Inflation Factor).
Design the architecture based on ECS (Entity-Component-System) and DDD.
Generate a Mermaid diagram showing Entities, Value Objects, and the Events this system will emit to the Event Bus.
Do NOT write code.

# Step 2 - Documentation and Limitations
Write the technical documentation for the system proposed in the previous step.
Define Objective, Responsibilities, Inputs (State inputs), Outputs (Emitted events), and Performance Limitations.
Justify why this approach avoids negative impacts on the "Save Game" (snapshot) mechanism and scalability.

# Step 3 - Interface Definition
Write strictly the Interfaces/Protocols of the system.
Define the Component structure and the signature of the System that will iterate over them.
Ensure strict typing. No logic implementation yet.

# Step 4 - Event-Driven Implementation
Implement the actual logic based on the approved interfaces.
Remember: the system must read from the current state, calculate the consequences, and emit durable events. Do not delete history (append-only state).
Return clean code, avoiding giant classes.

# Step 5 - Unit Tests and Simulation
Create the test suite for the implementation above.
The tests must simulate the execution of at least 5 "ticks" (turns) to ensure the state is mutated correctly and events are dispatched.
Use the project's standard testing framework.