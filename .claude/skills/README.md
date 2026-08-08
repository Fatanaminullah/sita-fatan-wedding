# Vendored skills

These are **Superpowers** by Jesse Vincent, MIT licensed, copied here from the
official Claude Code plugin at version 6.2.0. Full text in `LICENSE-superpowers`.

## Why they are committed

This repo's design spec and implementation plan were both produced with these
skills, and the plan's steps assume them. Superpowers normally installs
per-machine, into `~/.claude/plugins/`, which means a cloud or mobile Claude
session cloning this repo would not have it.

Project-scoped skills in `.claude/skills/` travel with the repo. Committing
them is what lets a phone session follow the same process the plan was written
for, with no setup step.

## One difference from the upstream plugin

Skills installed from a plugin are invoked with a prefix, as
`Skill(superpowers:test-driven-development)`. Project-scoped skills are
invoked by bare name, as `Skill(test-driven-development)`. Every
cross-reference in these files has been rewritten to drop the prefix so the
names resolve. That is the only edit; nothing else was changed.

## The ones that matter for the planner work

- `test-driven-development` — the plan's failing-test-first steps
- `executing-plans` — working a plan task by task with checkpoints
- `subagent-driven-development` — same, but only where subagents exist
- `verification-before-completion` — evidence before claiming anything passes
- `systematic-debugging` — when a test fails for a reason the plan did not predict

## Updating

Do not hand-edit these. Re-copy from the upstream plugin and re-run the prefix
strip:

```bash
P=~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>
cp -R $P/skills/. .claude/skills/
find .claude/skills -name "*.md" -exec sed -i '' 's/superpowers://g' {} +
```

`.claude/skills/impeccable/` is gitignored on purpose: it is 3.2M of vendored
runtime with node scripts, and it is a design-time tool rather than something
a build or a plan step needs.
