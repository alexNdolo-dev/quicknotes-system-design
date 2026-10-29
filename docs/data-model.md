# QuickNotes Data Model

QuickNotes has four tables: `users`, `notes`, `tags` and `note_tags`.

## Entities

### users

One row per person who has an account.

| Column | Type | Key / rule |
|--------|------|------------|
| id | INTEGER | **Primary key** |
| name | TEXT | Required |
| email | TEXT | Required, **unique** |
| password_hash | TEXT | Required (we never store the plain password) |
| created_at | TEXT | Filled in automatically |

### notes

One row per note.

| Column | Type | Key / rule |
|--------|------|------------|
| id | INTEGER | **Primary key** |
| user_id | INTEGER | **Foreign key** to `users(id)`, required |
| title | TEXT | Required, 100 characters or fewer |
| body | TEXT | Optional |
| category | TEXT | Required, default `personal` |
| created_at | TEXT | Filled in automatically |

### tags

One row per tag name.

| Column | Type | Key / rule |
|--------|------|------------|
| id | INTEGER | **Primary key** |
| name | TEXT | Required, **unique** |

### note_tags

The join table. One row means "this note has this tag".

| Column | Type | Key / rule |
|--------|------|------------|
| note_id | INTEGER | **Foreign key** to `notes(id)` |
| tag_id | INTEGER | **Foreign key** to `tags(id)` |
| (note_id, tag_id) | | **Composite primary key** |

## Relationships

- **One-to-many: users to notes.** One user has many notes, but each note belongs to one user. The "many" table (`notes`) holds the foreign key `user_id`.
- **Many-to-many: notes and tags.** One note can have many tags, and one tag can be on many notes. A single column cannot hold a list like "exams,urgent", so we use a third table, `note_tags`, that stores one pair of ids per row. Its composite primary key stops the same tag being added to the same note twice.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL CHECK (length(title) <= 100),
  body TEXT,
  category TEXT NOT NULL DEFAULT 'personal',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

## Example queries

### 1. All of one user's notes, newest first

This is what `GET /notes` runs for user 1.

```sql
SELECT id, title, body, category, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC;
```

### 2. All notes tagged "urgent" (uses JOINs)

```sql
SELECT notes.title
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags ON tags.id = note_tags.tag_id
WHERE tags.name = 'urgent';
```

### 3. How many notes each user has

`LEFT JOIN` keeps users who have zero notes.

```sql
SELECT users.name, COUNT(notes.id) AS note_count
FROM users
LEFT JOIN notes ON notes.user_id = users.id
GROUP BY users.id;
```

## Indexes

```sql
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
```

- **`notes(user_id)`:** every `GET /notes` filters by `user_id`. Without the index, the database would check every note in the table. With it, the database jumps straight to the user's notes. This is the most important index.
- **`note_tags(tag_id)`:** finding all notes with a tag searches by `tag_id`. The primary key already covers searching by `note_id`, but not by `tag_id`.

The cost: an index makes reads faster but makes writes slightly slower, and it uses some extra space. So we only index what we search often.

## SQL or NoSQL?

I choose **SQL** (a relational database such as PostgreSQL). QuickNotes has clear structure (users, notes and tags) and clear links between them, and SQL is very good at links and JOINs. It also enforces rules inside the database: unique emails, titles of at most 100 characters, and no note without a real user. These rules keep the data correct even if the app code has a bug. A document database like MongoDB is more flexible, but it is weaker at links and rules, and QuickNotes does not need that flexibility. At 1 million users, one SQL database with a read replica can handle the load.
