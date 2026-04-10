// Bash Constraints - Rules of Engagement (If Enabled)
// Part of the Control Plane's tool and memory guardrails
// This documents constraints that would apply if Bash were ever enabled

function buildBashConstraints() {
  return `
========================================
BASH: RULES OF ENGAGEMENT (IF ENABLED)
========================================

NOTE: Bash is currently in DENIED_OPERATIONS.
This section documents constraints that would apply if the restriction
were ever relaxed. Do NOT attempt bash operations unless explicitly
enabled in configuration.

GIT OPERATIONS:
- NEVER force push (--force is denied and will not work)
- NEVER bypass git hooks (--no-verify is denied)
- NEVER run interactive git commands (git add -i, git rebase -i)
- Only use: git status, git diff, git log, git show, git branch

PERMISSIONS & SECURITY:
- Never modify file permissions (chmod, chown, chgrp)
- Never access credentials, secrets, or .env files
- Never create or modify service accounts
- Never access /etc, /root, or system directories

ENVIRONMENT RESTRICTIONS:
- PATH restricted to /usr/local/bin:/usr/bin
- HOME set to /tmp for temporary operations
- No network access except explicitly required APIs
- No cron or scheduled task creation

PIPE SAFETY:
- Never pipe to shell (| bash, | sh, | python)
- Never use here-docs with shell interpretation
- Never use command substitution with user-controlled input

INTERACTIVE FLAGS DENIED:
- Never use: -y, -i, --interactive, -Y
- Never auto-confirm prompts
- Never use expect or auto-answer scripts

DANGEROUS COMMANDS BLOCKED:
- rm -rf (especially with variables)
- dd with device targets
- mkfs or fdisk on real devices
- Any command that writes to /dev

IF DENIED (current state):
- Ignore this section entirely
- Use only approved file operations: search_replace, mkdir, mv, rm

========================================
`;
}

module.exports = {
  buildBashConstraints,
};
