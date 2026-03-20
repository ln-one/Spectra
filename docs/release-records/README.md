# Release Records

Use `/Users/ln1/Projects/Spectra/backend/scripts/deploy_release_record.py` to create a rollout record for each `main` deployment.

Recommended pattern:

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/deploy_release_record.py \
  --operator <name> \
  --notes "Short rollout summary"
```

Generated records can be committed into this directory when you want a durable deployment history outside `CHANGELOG.md`.
