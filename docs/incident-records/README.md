# Incident Records

Use `/Users/ln1/Projects/Spectra/backend/scripts/incident_record.py` to create a post-incident record template when deploys or runtime failures need follow-up.

Recommended pattern:

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/incident_record.py \
  --title "Worker timeout spike" \
  --owner <name>
```
