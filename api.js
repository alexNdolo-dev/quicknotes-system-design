const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadBtn = document.querySelector("#load-btn");
const statusText = document.querySelector("#status");
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");
const list = document.querySelector("#notes-list");

// Show a message. type is "success", "error" or "" (neutral).
function setStatus(message, type) {
  statusText.textContent = message;
  statusText.className = type || "";
}

// One reusable function for every request:
// it calls fetch, checks response.ok and throws on errors.
async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data: data };
}

// Empty state
function showEmptyState() {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = "No notes to show.";
  list.appendChild(li);
}

function removeEmptyState() {
  const empty = list.querySelector(".empty");
  if (empty) empty.remove();
}

// Build one note. User text goes in with textContent only.
function createNoteItem(note) {
  const li = document.createElement("li");
  li.className = "note";

  const content = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = note.title;
  const body = document.createElement("p");
  body.textContent = note.body || "";
  content.appendChild(title);
  content.appendChild(body);
  li.appendChild(content);

  // The Delete button is added in the DELETE step (further down).
  if (typeof addDeleteButton === "function") {
    addDeleteButton(li, note);
  }
  return li;
}

// ========== GET: load notes ==========
function getNotes() {
  return request(`${API_URL}?_limit=10`);
}

function renderNotes(notes) {
  list.innerHTML = "";
  if (notes.length === 0) {
    showEmptyState();
    return;
  }
  notes.forEach((note) => list.appendChild(createNoteItem(note)));
}

async function loadNotes() {
  setStatus("Loading notes...", "");
  loadBtn.disabled = true;
  try {
    const result = await getNotes();
    renderNotes(result.data);
    setStatus(`Loaded ${result.data.length} notes from the server.`, "success");
  } catch (error) {
    setStatus("Could not load notes. Please try again.", "error");
    console.error(error);
  } finally {
    loadBtn.disabled = false;
  }
}

loadBtn.addEventListener("click", loadNotes);

// Show the empty state when the page first opens.
showEmptyState();