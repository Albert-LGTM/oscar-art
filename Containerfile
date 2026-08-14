# Ståsted — production image.
#
# Two stages: a Node builder that produces static files, and a Caddy runtime that
# serves them. No Node in the final image, so the runtime attack surface is a static
# file server and nothing else.
#
# The artwork-integrity guards run INSIDE the build. That is the point: an image that
# builds is an image whose artwork was verified uncropped, unfiltered and
# colour-profiled. A build that would ship a stripped ICC profile fails here rather
# than shipping quietly and looking fine on the developer's monitor.

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build
# ─────────────────────────────────────────────────────────────────────────────
# Debian slim rather than Alpine: sharp links against libvips, and the glibc prebuilt
# binaries are the well-trodden path. Colour handling is the one thing in this project
# that must not be experimental.
FROM docker.io/library/node:22-bookworm-slim AS build

WORKDIR /app

# Dependencies first, so a content edit does not invalidate the npm layer.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Placeholder sources, generated at the exact dimensions declared in the content model.
# REPLACE THIS in Phase 0: mount or COPY the real documentation into public/media/ and
# delete this line. It exists so the image builds and runs today, with obviously
# synthetic images that cannot be mistaken for the artist's work.
RUN npm run seed:media

# One explicit, human-verified conversion at ingest. AVIF + WebP + JPEG at seven widths,
# never upscaled past native, ICC written explicitly rather than inherited.
RUN npm run build:media

# Letterboxed 1200x630 link-preview cards. Generated from the same originals through the
# same colour-managed pipeline, so a card carries the same guarantee as the page.
RUN npm run build:social

RUN npm run build

# ── Guards. Each of these has been negative-tested; none is decorative. ──
# Fails if any derivative lost or changed its colour profile.
RUN npm run test:colour
# Fails if any CSS rule can crop, filter or reproportion artwork.
RUN npm run lint:plates
# Fails on a missing h1/main/nav, a duplicated canonical, absent hreflang, or an <img>
# without alt or intrinsic dimensions.
RUN npm run lint:semantics

# CSP hashes derived from what the build actually emitted, written into the Caddyfile.
RUN npm run gen:csp

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — serve
# ─────────────────────────────────────────────────────────────────────────────
FROM docker.io/library/caddy:2-alpine

# The upstream binary ships with `cap_net_bind_service=ep` as a FILE capability, so it
# can bind :80 as non-root. We bind :8080, so we do not need it — and keeping it makes
# the container refuse to start under `--cap-drop ALL`: when the bounding set cannot
# satisfy a binary's file capabilities, exec fails outright with
# "Operation not permitted", which reads like a broken image rather than a policy
# conflict.
#
# `cp` does not carry xattrs across, so copying the binary over itself strips the
# capability without needing libcap installed in the image.
USER 0
RUN cp /usr/bin/caddy /usr/bin/caddy.stripped \
 && mv -f /usr/bin/caddy.stripped /usr/bin/caddy \
 && chmod 0755 /usr/bin/caddy

COPY --from=build /app/dist /srv
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile

# Non-root. Caddy wants somewhere writable for its own state; auto_https is off (TLS
# terminates upstream) so there are no certificates to persist and /tmp is enough.
ENV XDG_CONFIG_HOME=/tmp XDG_DATA_HOME=/tmp
USER 1000:1000

EXPOSE 8080

# No HEALTHCHECK directive: Podman builds OCI images by default and silently ignores
# it. The health check lives in podman-compose.yml, and the equivalent flags for a
# plain `podman run` are documented in README.md — a check that is quietly dropped is
# worse than no check, because it reads as covered.

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
