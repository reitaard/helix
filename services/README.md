# Services

Do not create services just to match conceptual Helix divisions.

A custom service should appear when a real boundary demands it: durable niche/experiment state, computation-heavy scoring, ingestion, provider normalization, media ownership, platform integration, or an API needed by Reitaard that is awkward to implement reliably in n8n.

Conceptual system separation does not imply one microservice per concept.