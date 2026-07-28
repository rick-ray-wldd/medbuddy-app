# Module seams

The pipeline is deliberately one-directional. Each arrow is a seam that can be
tested through its interface alone.

```
input (photo | text | speech)
      │
      ▼
grounding/   resolve free text to known drugs / supplements / ingredients
      │      unresolved is a first-class result, never a guess
      ▼
rules/       deterministic evaluation against versioned rule sets
      │      pure functions; no I/O, no model calls
      ▼
verdict/     the single object that carries every clinical judgement
      │
      ▼
narration/   translate a verdict into plain language
             receives ONLY the verdict — it cannot query the registers
```

## The load-bearing rule

**Clinical judgement ends at `verdict/`.** Everything downstream of it is
presentation.

The verdict does carry register-derived fields — ingredients, indications, a
product's approved warning — because narration has to be able to say what a
medicine is for. What narration cannot do is *look anything up*: it has no
access to the registers or the rule sets, so it cannot introduce a medicine, a
criterion, or a warning that the verdict did not already contain. Its input is
a fixed object, so its output is asserted against that object in tests.

`rules/` holds no medication knowledge of its own; it interprets the shape of
whatever is in `config/rules/`. Adding a rule set means adding a file there,
not editing code.
