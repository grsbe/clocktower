# Clocktower

A companion web app for running a game of Blood on the Clocktower at a table: players join a
room with a four-letter code, arrange the seating, and play on a shared circular table where the
storyteller drives the phases and a synchronised clock hand sweeps the circle collecting votes.

It does not handle character scripts, roles or a grimoire — those stay physical. What it does
handle is the bookkeeping that is awkward in person: seating order, who nominated whom, a vote
that everyone sees at the same instant, and the storyteller's private notes.

## What it does

- **Join** with a four-letter room code, a name and a small drawn character token.
- **Reconnect** automatically after a dropped connection or a page reload. On a fresh device,
  entering the code lists the roster and you tap your own name to take your seat back.
- **Lobby**: drag names to set the seating order, drag someone into the storyteller slot, start
  the game.
- **Table**: everyone drawn in seating order around a circle, with the current phase in the
  middle. The storyteller switches between night, day and dusk.
- **Nominations** open at dusk; any player taps a seat to nominate.
- **Voting**: the storyteller picks a speed and starts the vote. A clock hand sweeps from the
  nominee around the circle. You can raise or lower your hand until the hand reaches you, at
  which point your vote locks and becomes visible to everyone. Pending hands are private, so
  nobody can simply copy the votes ahead of them.
- **Ghost votes**: a dead player has one vote left for the rest of the game. Spending it marks
  their token, but the app never blocks them from voting again — the storyteller decides.
- **Storyteller view**: private notes under every player, alive/dead toggles, ghost-vote
  markers and a log of earlier nominations. Notes are filtered out server-side and never reach
  a player's browser.

## Running it

The container listens on port 3000 and serves both the app and the websocket from there.

```sh
docker compose build
docker compose up -d
```

`docker-compose.yml` declares `expose: 3000` and publishes nothing to the host, on the
assumption that a reverse proxy on the same Docker network talks to the container directly.

### Shipping it to a server

To move a built image to a machine that does not have the source, build and export it:

```powershell
powershell -File scripts\build-and-export.ps1
```

That produces `dist/botct-webapp-latest.tar.gz`, built for `linux/amd64`. Copy it over
together with `docker-compose.deploy.yml`, then on the server:

```sh
docker load -i botct-webapp-latest.tar.gz
docker compose -f docker-compose.deploy.yml up -d
```

`docker-compose.deploy.yml` is the same service without the `build:` key, so it runs the loaded
image rather than looking for a Dockerfile.

### Environment

| Variable | Default | Meaning                    |
| -------- | ------- | -------------------------- |
| `PORT`   | `3000`  | Port the server listens on |

`GET /healthz` returns `{"ok":true,"rooms":N}` and is wired up as the container healthcheck.

## Developing

Two processes. The Vite dev server proxies `/socket.io` through to the backend.

```sh
cd server && npm ci --ignore-scripts && npm run dev    # :3000
cd client && npm ci --ignore-scripts && npm run dev    # :5173
```

Open <http://localhost:5173> in several tabs to play against yourself. To test the production
path instead, run `npm run build` in `client/` (it writes into `server/public/`) and then just
start the server.

## Dependencies

The dependency footprint is deliberately small and limited to long-established packages:
`express` and `socket.io` on the server, `react`, `socket.io-client` and `@dnd-kit/*` on the
client, with `vite` for the build.

Both lockfiles are committed and the Docker build installs with `npm ci --ignore-scripts`, so
the image is built from exactly the pinned versions and no dependency executes code during the
build. Nothing in either tree needs an install script to work. Run `npm audit` in `server/` and
`client/` after any dependency change; both are expected to report zero vulnerabilities.

## How it is put together

```
shared/events.js   socket event names and limits, imported by both sides
server/src/
  index.js             express static hosting + socket.io on one HTTP server
  rooms.js             in-memory room store, code generation, inactivity sweep
  room-state.js        per-viewer sanitising (this is what hides notes and pending hands)
  voting.js            the vote clock: order, per-seat lock timers, ghost votes
  socket-handlers.js   every event, with its permission and phase checks
client/src/
  socket.js            socket singleton and the server-clock offset handshake
  screens/             JoinScreen, LobbyScreen, GameScreen
  components/          SeatCircle, ClockHand, NominationBar, StorytellerPanel, AvatarDraw
```

All game state lives in server memory and is authoritative; clients render what they are sent
and ask the server to change it. Rooms are dropped after twelve hours with nobody connected,
and restarting the container ends any game in progress.

### Keeping the vote in sync

Network latency must not make one person's clock hand lag another's. On connect, each client
measures its offset from the server clock with five round trips and keeps the median. When a
vote starts, the server broadcasts a single `startAt` timestamp three seconds in the future;
every client then animates the hand from that same moment against its corrected clock, so no
further messages are needed to stay in step.

Votes are not read off that animation. The server runs its own timer per seat and publishes
each locked vote as the hand passes, one grace period (300 ms) after it visually arrives, so a
hand raised just in time but delivered just late still counts and nothing has to be retracted.
Every client therefore shows the same tally regardless of its connection quality.
