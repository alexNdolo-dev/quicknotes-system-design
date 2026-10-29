# QuickNotes Architecture

This document describes how QuickNotes can grow from a browser-only app to an online service for **1 million users**.

## 1. Requirements

### Functional requirements (what the system does)

- A user can **sign up and log in**.
- A user can **create, read, update and delete** their own notes.
- A user can add **tags** to notes and **filter** or **search** notes.
- A user only sees **their own** notes.
- Notes are saved on the server, so they work on any device.

### Non-functional requirements (how well it works)

- **Availability:** at least 99.9% uptime (about 8.8 hours of downtime a year).
- **Latency:** loading notes takes under 200 ms for 95% of requests.
- **Scalability:** handle 1 million registered users, and grow by adding servers.
- **Durability:** a saved note is never lost, because we make regular backups and keep copies.
- **Security:** all traffic uses HTTPS, passwords are stored as hashes, and every request checks a token.
- **Consistency:** a note list that is one or two seconds out of date is acceptable.

## 2. Load estimate (1 million users)

Assumptions:

- 1,000,000 registered users.
- 20% use the app on a given day, so **200,000 daily active users (DAU)**.
- Each active user creates **5 notes** a day and loads their notes **20 times** a day.
- An average note is about **500 bytes**.
- One day is about 100,000 seconds (rounded), and peak traffic is 5 times the average.

```
Writes: 200,000 users × 5 notes   = 1,000,000 per day
        1,000,000 ÷ 100,000       ≈ 10 writes per second   (peak ≈ 50)

Reads:  200,000 users × 20 loads  = 4,000,000 per day
        4,000,000 ÷ 100,000       ≈ 40 reads per second    (peak ≈ 200)

Storage: 1,000,000 notes/day × 500 bytes = 500 MB per day
         500 MB × 365                    ≈ 180 GB per year
```

| Measure | Average | Peak |
|---------|---------|------|
| Reads per second | 40 | 200 |
| Writes per second | 10 | 50 |
| Storage per year | about 180 GB | |

**What this tells us:** the system is **read-heavy** (4 times more reads than writes), so caching reads helps a lot. 200 requests per second at peak is fine for a few ordinary servers, and 180 GB a year fits in one database. The design does not need to be huge.

## 3. Architecture diagram

```
                         ┌─────────┐
          ┌─────────────>│   DNS   │  (quicknotes.com → IP addresses)
          │              └─────────┘
 ┌────────┴──────┐  static files  ┌──────────────────────┐
 │ Browser /     │ ─────────────> │ CDN (HTML, CSS, JS)  │
 │ mobile client │                └──────────────────────┘
 └────────┬──────┘
          │ API calls (HTTPS, JSON)
          v
   ┌───────────────┐
   │ Load balancer │
   └──────┬────────┘
     ┌────┴─────┬──────────┐
     v          v          v
 ┌───────┐  ┌───────┐  ┌───────┐        ┌──────────────┐
 │ App 1 │  │ App 2 │  │ App 3 │ ─────> │ Cache (Redis)│
 └───┬───┘  └───┬───┘  └───┬───┘        └──────────────┘
     │ writes   │ reads    │ jobs
     v          v          v
 ┌─────────┐ ┌──────────┐ ┌───────┐   ┌────────┐
 │ Primary │>│ Read     │ │ Queue │──>│ Worker │ (emails, exports)
 │   DB    │ │ replica  │ └───────┘   └────────┘
 └─────────┘ └──────────┘
```

## 4. What each component does

- **Client (browser or mobile app):** shows the notes to the user and sends requests, so the user has something to use.
- **DNS:** turns `quicknotes.com` into an IP address, so users can find the service.
- **CDN:** serves the HTML, CSS and JavaScript from servers close to the user, so pages load fast and our servers carry less load.
- **Load balancer:** spreads requests across the app servers and skips any that are down, so no single server is overloaded.
- **App servers (2 or more):** run the API code (log in, notes, tags), and because they are stateless we can add more when traffic grows.
- **Cache (Redis):** keeps each user's recent note list in memory, so most reads are answered without touching the database.
- **Primary database:** stores all the data and accepts every write, so there is one true copy of the data.
- **Read replica:** holds a copy of the primary and answers reads, so the primary is not overloaded.
- **Queue:** holds slow jobs such as emails and exports, so the app can reply to the user straight away.
- **Worker:** takes jobs from the queue and does them in the background, so slow work never makes users wait.

## 5. Request flows

### GET /notes

1. The browser sends `GET /notes` with the token, and it reaches the **load balancer**.
2. The load balancer picks the least busy healthy **app server** (about 1 ms).
3. The app server checks the token and finds the user, for example user 1 (1 to 2 ms).
4. It asks **Redis** for `notes:user:1`.
5. **Cache hit:** the notes come back in about 1 ms and the server replies `200 OK`. Total time at the server is under 10 ms.
6. **Cache miss:** the server queries a **read replica**: `SELECT ... FROM notes WHERE user_id = 1 ORDER BY created_at DESC` (about 5 to 20 ms with the index).
7. It saves the result in Redis with a TTL (for example 5 minutes), and replies `200 OK`. The next request will be a cache hit.

### POST /notes

1. The browser sends `POST /notes` with the token and the JSON body, and it reaches the **load balancer**.
2. The load balancer forwards it to any healthy **app server**.
3. The app server checks the token, then **validates** the data (title required, at most 100 characters).
4. It writes the note to the **primary database** (about 5 to 10 ms), because only the primary accepts writes.
5. It **deletes** `notes:user:1` from the Redis cache, so stale notes are never served.
6. If there is slow work (for example an email), it adds a job to the **queue**.
7. It replies `201 Created` with the new note. Within a few milliseconds the primary copies the new row to the replicas.

## 6. Trade-offs

- **Speed versus freshness.** The cache and the read replica make reads fast, but a user can briefly see an old list (for example, a new note may be missing for a moment because of replication lag). For notes this is fine. For something like a bank balance, it would not be.
- **Simplicity versus scalability.** One server is easy to build and understand, but it cannot grow and is a single point of failure. Several app servers, a cache and a replica add complexity, but they let the system handle 1 million users.
- **Cost versus reliability.** Extra servers, a replica and backups cost more money, but they keep the service up and the data safe. We choose enough redundancy for 99.9% uptime, and we do not over-build (for example, no sharding yet, because 180 GB a year does not need it).
- **Fast replies versus instant results.** Using a queue and a worker makes the app reply quickly, but slow jobs such as emails finish a little later.

## 7. Avoiding single points of failure

A single point of failure (SPOF) is a part that takes the whole system down if it breaks. We avoid them like this:

- **App servers:** we run two or more, behind the load balancer. If one crashes, the **health check** notices and the load balancer stops sending it traffic. The servers are **stateless**, so no data is lost.
- **Load balancer:** we use a managed cloud load balancer that is itself spread across several machines.
- **Database:** the primary has a **read replica**. If the primary fails, the replica can be promoted to become the new primary (**failover**). We also make **regular backups** and test restoring them.
- **Cache:** if Redis is down, the app falls back to reading from the database (slower, but still working). This is **graceful degradation**.
- **Queue and workers:** jobs wait safely in the queue, and we can run more than one worker, so if a worker dies, another takes over.
- **CDN and DNS:** both are run by providers that already spread across many servers around the world.
