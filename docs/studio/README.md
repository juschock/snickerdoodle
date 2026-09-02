# RacobenStudio — design docs

These documents describe **RacobenStudio**, the staff-only internal operations backend for Snickerdoodle (and eventually other Racoben products).

**Implementation repo:** [juschock/RacobenStudio](https://github.com/juschock/RacobenStudio) — separate from [juschock/CauseBrief](https://github.com/juschock/CauseBrief) (Snickerdoodle product).

The implementation repository is external to this workspace. Discover and verify any local RacobenStudio checkout before relying on its path, setup state, or development URL; this repository does not assert that a sibling checkout exists.

| Doc | Purpose |
|-----|---------|
| [studio-architecture.md](./studio-architecture.md) | System overview, repos, deployments |
| [deployment-model.md](./deployment-model.md) | Public vs internal apps, domains, isolation |
| [data-model.md](./data-model.md) | Core entities and relationships |
| [campaign-model.md](./campaign-model.md) | Multi-campaign per client, types, milestones |
| [analytics-model.md](./analytics-model.md) | Operations, PMF, and outcome analytics |
| [intake-connectivity.md](./intake-connectivity.md) | Public form → Studio API flow |
| [phase-plan.md](./phase-plan.md) | Phased build order |

RacobenStudio already exists as a separate implementation repository. Keep implementation-specific documentation
canonical there; retain only the public-product boundary and connectivity notes in this repository.
