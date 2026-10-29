# QuickNotes API Design

This is the REST API the backend team should build for QuickNotes. It is **not** JSONPlaceholder. It uses JSON, HTTPS and a login token.

## Rules for the API

- Resources are **plural nouns**: `/notes`, `/tags`.
- The **HTTP method** says what to do. The **URL** says what to do it to.
- A single item is addressed by its id: `/notes/42`.
- Every request except login sends a token in the header: `Authorization: Bearer <token>`.
- The server uses the token to know which user is asking, so a user only sees their own notes.

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/auth/login` | Log in with email and password and get a token | 200 OK |
| 2 | GET | `/notes` | List the logged-in user's notes (newest first) | 200 OK |
| 3 | GET | `/notes/{id}` | Get one note | 200 OK |
| 4 | POST | `/notes` | Create a new note | 201 Created |
| 5 | PATCH | `/notes/{id}` | Change some fields of a note | 200 OK |
| 6 | DELETE | `/notes/{id}` | Delete a note | 204 No Content |
| 7 | GET | `/tags` | List all tags | 200 OK |
| 8 | POST | `/notes/{id}/tags` | Add a tag to a note | 201 Created |

### Filtering with query parameters

`GET /notes` can be filtered. Query parameters come after the `?` and are joined with `&`.

- `GET /notes?category=work` lists only work notes.
- `GET /notes?search=report` lists notes that contain "report".
- `GET /notes?category=work&search=report&limit=10` combines them.

## Example: create a note

### Request

```http
POST /notes HTTP/1.1
Host: api.quicknotes.com
Content-Type: application/json
Authorization: Bearer abc123

{
  "title": "Buy milk",
  "body": "2 litres, low fat",
  "category": "personal",
  "tags": ["errands"]
}
```

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": 42,
  "title": "Buy milk",
  "body": "2 litres, low fat",
  "category": "personal",
  "tags": ["errands"],
  "createdAt": "2026-10-28T09:15:00Z"
}
```

## Example: list notes

### Request

```http
GET /notes?limit=2 HTTP/1.1
Host: api.quicknotes.com
Authorization: Bearer abc123
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "notes": [
    {
      "id": 42,
      "title": "Buy milk",
      "body": "2 litres, low fat",
      "category": "personal",
      "tags": ["errands"],
      "createdAt": "2026-10-28T09:15:00Z"
    },
    {
      "id": 41,
      "title": "Revise HTTP methods",
      "body": "",
      "category": "study",
      "tags": ["exams", "urgent"],
      "createdAt": "2026-10-27T18:40:00Z"
    }
  ],
  "total": 2
}
```

## Error codes

Every error uses the same body shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Note 999 was not found."
  }
}
```

| Status | Name | When it happens | Example error body |
|--------|------|-----------------|--------------------|
| 400 | Bad Request | The request is invalid, for example an empty title or a title longer than 100 characters. | `{ "error": { "code": "BAD_REQUEST", "message": "Title is required and must be 100 characters or fewer." } }` |
| 401 | Unauthorized | The user is not logged in, or the token is missing, wrong or expired. | `{ "error": { "code": "UNAUTHORIZED", "message": "Please log in to continue." } }` |
| 403 | Forbidden | The user is logged in but tries to use someone else's note. | `{ "error": { "code": "FORBIDDEN", "message": "You are not allowed to delete this note." } }` |
| 404 | Not Found | The note or URL does not exist. | `{ "error": { "code": "NOT_FOUND", "message": "Note 999 was not found." } }` |
| 429 | Too Many Requests | The user sent too many requests too quickly (rate limiting). | `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests. Try again in a minute." } }` |
| 500 | Internal Server Error | Something broke on the server. | `{ "error": { "code": "SERVER_ERROR", "message": "Something went wrong. Please try again later." } }` |
