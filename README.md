# Musik for Navidrome

An independent web interface for an existing Navidrome server, with desktop/mobile
library views, playlists, streaming playback, a full-screen player and synchronized
lyrics. Word animation requires actual word timestamps from the server.

## Install the prebuilt container

Import `docker-compose.yml` into ZimaOS, or run `docker compose up -d`.
No local build and no application-files volume are required.

- Set `NAVIDROME_URL` to your existing Navidrome address, including any base path.
- Add your NAS IP/hostname to `ALLOWED_HOSTS` (without the port).
- Open port4173 and sign in with your Navidrome account.
- For an HTTPS reverse proxy, set `PUBLIC_ORIGIN` to the exact external UI origin.

The default upstream `http://navidrome:4533` works only when that hostname resolves
from the UI container, for example on a shared Docker network. Otherwise use the
reachable NAS IP/port or Navidrome HTTPS address.

The image runs as a non-root user and supports read-only operation. No music
directory is mounted. Existing Navidrome manages music, covers and playlists.
Login sessions are in memory; container restarts require signing in again.

## Images and updates

`ghcr.io/jbroerdev/navidrome-musik:latest` is the publication target.
The publish workflow tests the application, smoke-tests the built AMD64 container,
then publishes AMD64 and ARM64 images. Each build also has an immutable commit tag
`sha-<full-commit-sha>`. Check the successful Actions run and public package visibility
before treating a new publication as available without authentication.

In ZimaOS, pull the new image and recreate the UI container to update. To build
locally instead: `docker build -t navidrome-musik:local .`.

This interface is inspired by the Apple Music layout, and is not affiliated with
Apple. Exact background motion, font metrics and complete visual parity are not claimed.
