# ADR 0003: Browser baseline

Chrome is the primary target. Core workflows will be tested in current Edge, Firefox, and Safari. File System Access enhancements are capability-gated.

File handles remain session-only. Persisted handles do not guarantee future permission and are not required for recovery, so the application does not store them in IndexedDB. Recovery stores verified original bytes; derived thumbnails are regenerated and cached only for the active session.

Status: accepted.
