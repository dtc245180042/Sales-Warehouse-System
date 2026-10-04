# Antigravity Workspace Rule: Team Development & Agent Behavior Guidelines

## Critical Directives
1. **Never Delete Root Configuration Files**:
   - `index.html` is the root Vite entry point. Never delete or relocate it.
   - Do not wrap the project in a nested `frontend/` folder. All frontend code lives at repo root `./src`.

2. **Git Safety**:
   - Never empty or wipe out the `develop` branch.
   - Always verify and resolve merge conflicts by component integration, not by deleting other members' work.

3. **Validation Requirements**:
   - Every task that modifies frontend code MUST verify `npm run lint` and `npm run build` before completion.
   - Never define nested React components inside other components during render (`react-hooks/static-components`).
   - Clean up any unused imports or variables before finishing.

4. **Component Architecture**:
   - New screens must be created as separate files under `src/pages/`.
   - Reusable components belong in `src/components/`.
   - Do not expand `src/App.jsx` into a monolithic file; modularize new features.
