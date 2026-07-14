# A routine's slug names its subject, not its template

Adding a routine from a template seeded its slug from the _template's_ name:
`kebab(template.name)`, then `uniqueSlug` bumped collisions to `-2`, `-3`
(ADR-0020/0029). So every routine born from one template wanted the same base
slug — two repo-pulse routines became `repo-pulse` and `repo-pulse-2`. The
counter carried no information about _which_ repo each watched; the slug named
the machine that stamped the instance, not the instance. Users worked around it
by hand-typing a subject slug (`corza-pulse`) while leaving the display name as
something else — three vocabularies for one widget (template `repo-pulse`, slug
`corza-pulse`, name "Pull Requests").

A slug is the one identifier that can't lie: it's the artifact path
`w/<slug>/index.html` (ADR-0002), the publish-receipt filename (ADR-0026), and
the compare-renders URL (ADR-0038). It should answer "**which one is this?**"
out of context. `repo-pulse-3` fails that; `corza-pulse` passes it.

The uniqueness key is the pair _(subject, kind)_, not either alone: `repo-pulse`
collides across routines that share a template; `corza` collides across
routines that share a subject. Both parts belong in the slug.

**Decisions.**

- **Slug = `<subject>-<kind>`.** The subject comes from the routine's data, the
  kind from the template. Two repo-pulse routines on different repos are
  `corza-pulse` and `acme-pulse` — distinct by construction, each
  self-describing, no counter. The `uniqueSlug` counter survives only as the
  honest last resort for two _genuinely identical_ routines (same template,
  same subject), where a `-2` is the truthful signal that they are duplicates.

- **Templates declare their subject and kind.** The `widget:` frontmatter gains
  two optional fields (`packages/schema`):
  - `subjectParam` — the key of the param that carries the subject
    (repo-pulse → `repos`). The wizard reduces its answer to a bare token: a
    repo's name without its owner (`Form-Factory/corza` → `corza`), or a string
    param's trimmed text. The subject is the _first_ repo when the param is a
    list.
  - `kind` — the slug stem. Defaults to the template id's last hyphen segment
    (`repo-pulse` → `pulse`) via the exported `templateKind`, so most templates
    set nothing. A template with no `subjectParam` (the `custom` built-in) has
    no natural subject; the wizard falls back to the name-seeded slug.

- **The wizard derives, it doesn't solicit.** For a subject template the slug
  renders as a read-only chip showing the derived value — not a text field.
  The slug is fixed for the life of the routine (delete + re-add to rename), so
  an editable box there only invited a permanent typo, and a second "what do I
  call this" field is what produced the three-vocabulary muddle. A collapsed
  **Customize** disclosure reveals an editable field for the rare deliberate
  override (`corza-pulse-staging` over `corza-pulse-2`); once used, the subject
  no longer drives the slug. The display `name` seeds from the subject too
  (`Corza`), title-cased, and stays user-overridable.

**Back-compat.** The two fields are optional and additive; templates without
them keep the name-seeded behavior unchanged, and the `custom` built-in relies
on exactly that. The only built-in that gains a subject is `repo-pulse`
(`subjectParam: repos`, kind defaulting to `pulse`). Existing routines already
in a data repo are untouched — their slugs are fixed data, and edit mode never
re-derives a slug. No migration.

Cost: two schema fields and a branch in the add-routine wizard. Rejected: a
random/hash suffix to guarantee uniqueness without a counter — it re-obfuscates
the slug we just made meaningful (the artifact path, receipt, and URL all read
worse), taxes 100% of slugs to avoid a rare, already-handled, honest case, and
only "never conflicts" if it hashes something non-deterministic, which the slug
must not. Rejected: bare-subject slugs (`corza`) that append the kind only on
collision — asymmetric (`corza` next to `corza-deploys`) and the lone `corza`
stops telling you its genre.
