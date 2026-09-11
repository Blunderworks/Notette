# AGENTS.md — Always Read

This file must be read in its entirety at the start of every task. It contains only rules that apply to every task, regardless of feature or area. Feature-specific instructions live in [ARCHITECTURE.md](ARCHITECTURE.md) and should only be consulted (searched, not fully read) when working on the relevant section.

## Mandatory rules

1. **Keep docs in sync with code.** Whenever you make a code change, update AGENTS.md and/or ARCHITECTURE.md in the same task if the change affects a rule, workflow, or feature described there. Do not leave documentation stale — treat doc updates as part of the change, not a follow-up.
2. **Git is read-only by default.** Never run any git command that changes repository or working-tree state (e.g. `commit`, `add`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout` to discard changes, `branch -d`, `tag`, `stash` other than inspecting) unless the user explicitly asks for that specific action in the current request. Read-only commands (`status`, `log`, `diff`, `show`, `blame`) are always fine.
3. **When adding a new feature or section**, add or update the corresponding section in ARCHITECTURE.md rather than leaving knowledge only in code comments or commit messages.
4. **Keep this file general.** Do not add feature-specific instructions here — they belong in ARCHITECTURE.md, organized by section.
5. **Verify before finishing.** Run `pnpm run check` and `pnpm test` after any code change, and `pnpm run build` when touching build configuration, the widget, or server routes. Fix what they report; do not leave known failures.
6. **Use pnpm for JavaScript, never npm or yarn.** The project pins pnpm via `packageManager` in `package.json`; only `pnpm-lock.yaml` may be tracked as a lockfile, and JavaScript scripts, docs, Dockerfile and workflows must invoke `pnpm`. Packages for other ecosystems use their native tools; generated local lockfiles must be ignored.
7. **Never commit secrets or local state.** `.env`, `data/`, `build/` and `.widget-dist/` are git-ignored on purpose; add new environment variables to `.env.example` instead.
