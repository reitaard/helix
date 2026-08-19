# Analytics / Feedback

Future home for normalized platform performance and operational feedback.

The working output concept is `PerformanceSnapshot`: a time-stamped observation tied to a `PublishedPost`, variant/experiment lineage, and relevant context.

Analytics should preserve raw observed metrics separately from derived scores. Derived winner/fitness logic belongs in the Experiment Engine.