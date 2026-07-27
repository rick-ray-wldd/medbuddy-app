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
             receives ONLY the verdict — never the raw drug data
```

## The load-bearing rule

**Clinical judgement ends at `verdict/`.** Everything downstream of it is
presentation. The model in `narration/` cannot reach the drug data, so it
cannot invent a finding — and because its input is a fixed object, its output
can be asserted against that object in tests.

`rules/` holds no medication knowledge of its own; it interprets the shape of
whatever is in `config/rules/`. Adding a rule set means adding a file there,
not editing code.
