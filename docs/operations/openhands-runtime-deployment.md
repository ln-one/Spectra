# OpenHands Agent Runtime deployment

Spectra consumes the private-source Agent Runtime as a public, immutable GHCR
image. The image is an artifact boundary: the `spectra-agent-runtime` source
repository remains private, while the published image contains the resources
needed to execute authoring tasks.

## Local single-node profile

This profile is for local development or a single operator. It uses one
persistent Agent Server at `http://127.0.0.1:8000`; it is not a production
multi-tenant topology.

1. Copy `.env.example` to an ignored `.env.local` and set at least:

   - `OPENHANDS_EXECUTION_ENABLED=true`
   - `OPENHANDS_RUNTIME_API_KEY`
   - `OPENHANDS_SECRET_KEY`
   - `OPENHANDS_LLM_API_KEY`
   - `OPENHANDS_LLM_BASE_URL`
   - `OPENHANDS_LLM_MODEL`

2. Start the dependency and Runtime containers:

   ```bash
   docker compose \
     --env-file .env.local \
     --file compose.yaml \
     --file compose.openhands.yaml \
     --profile openhands up --detach --wait
   ```

3. Check the Runtime directly:

   ```bash
   curl --fail \
     --header "X-Session-API-Key: ${OPENHANDS_RUNTIME_API_KEY}" \
     http://127.0.0.1:8000/ready
   ```

4. Start Spectra with the same `.env.local` and verify that artifact authoring
   reports the Runtime as available.

The Compose file pins the image digest recorded in `runtime.lock.json`. Set
`OPENHANDS_RUNTIME_IMAGE` only when intentionally testing another digest.
The current image is `linux/amd64`; Docker Desktop can run it through
emulation on Apple Silicon. Native ARM publishing is tracked separately.

The Runtime volume and `OPENHANDS_SECRET_KEY` must be retained together. Do not
reuse a Runtime volume with a different secret, and do not publish either
secret in a repository, image, log, or conversation payload.

## Production boundary

Do not use the fixed loopback URL or the shared Compose Runtime in production.
Set `OPENHANDS_RUNTIME_URL_TEMPLATE` to an HTTPS route containing exactly one
`{attemptId}` token. The provisioner must resolve every attempt to its own
isolated Agent Server, workspace volume, persistence root, and secret. Spectra
will reject a fixed Runtime URL when `NODE_ENV=production`.

The public image can be pulled anonymously, but access to the Spectra source
repository and all model/provider credentials remains private.
