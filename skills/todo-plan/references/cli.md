# todo CLI Reference

## Commands

```
todo init                              Initialize .todo/ in current git repo
todo new [summary]                     Create a ticket
  --type bug|feature|refactor|chore|debt   (default: chore)
  --source log|test|agent|human|comment    (default: human)
  --file <path>                            Associate a file path
  --lines <start,end>                      Line range for the file
  --tags <t1,t2>                           Comma-separated tags
  --parent <id>                            Parent ticket ID
  --pipe                                   Read summary from stdin

todo list                              List open tickets
  --state <state>                          Filter by state
  --type <type>                            Filter by type
  --tag <tag>                              Filter by tag
  --file <path>                            Filter by file path
  --sort updated|created|type|state        Sort field (default: updated)
  --json                                   Output as JSON array
  --limit <n>                              Max results

todo show <id>                         Show ticket detail (supports prefix IDs)
  --raw                                    Dump raw JSON

todo edit <id>                         Edit ticket fields
  --summary <text>
  --description <text>
  --type <type>
  --tags <t1,t2>                           Replace all tags
  --add-tag <tag>
  --rm-tag <tag>

todo transition <id> <state>           Transition ticket state
  --commit <sha>                           Resolution commit SHA
  --test <file::func>                      Test file and function
  --note <text>                            Resolution note
  --depends-on <id>                        Set dependency
  --duplicate-of <id>                      Mark as duplicate

todo close <id>                        Shorthand: transition to done
  --commit <sha>                           Defaults to HEAD
  --test <file::func>
  --note <text>
  --checkout                               Checkout base_branch after close

todo work <id>                         Start or resume work on a ticket
  --branch <name>                          Override branch name
  --actor <name>                           Override actor identity

todo analyze <id>                      Add analysis entry (append-only)
  --type blame|hypothesis|evidence|conclusion   (required)
  --content <text>                              (required)
  --confidence low|medium|high
  --supporting <0,1,2>                     Indices of supporting entries

todo link <id>                         Link to commit, file, or ticket
  --to <target>                            Ticket ID, commit SHA, or file path (required)
  --relation depends_on|blocks|related|duplicates   (default: related)
  --as <note>                              Note for file links

todo scan                              Scan source tree for TODO/FIXME/etc
  --dry-run                                Preview only
  --type <tickettype>                      Type for created tickets (default: chore)

todo dedup                             Find potential duplicate tickets
  --strategy fingerprint|file-line|semantic   (default: fingerprint)
  --apply                                  Write related links (default: dry-run)

todo export                            Export tickets to stdout as JSON
  --state <state>
  --type <type>
```

## States

| State | Meaning |
|---|---|
| `open` | Captured, not being worked |
| `active` | Currently in progress |
| `blocked` | Waiting on something |
| `done` | Completed with proof |
| `wontfix` | Intentionally closed without fix |
| `duplicate` | Superseded by another ticket |

Terminal states (done, wontfix, duplicate) cannot be transitioned out of.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Validation or logic error |
| 2 | Ticket not found |
| 3 | Git error (not a repo, git command failed) |

## Storage

Tickets are JSON files in `.todo/open/<id>.json` or `.todo/done/<id>.json`.
The directory is the source of truth for terminal vs non-terminal state.
`.todo/` is committed to the repo — ticket history is git history.
