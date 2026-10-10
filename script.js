"use strict";

const $ = (id) => document.getElementById(id);

function loadData(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved);
  } catch (error) {
    console.error("Could not read saved data:", error);
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
    alert("Browser storage is unavailable. Please check your browser settings.");
    return false;
  }
}

function getFirstValue(object, keys, fallback = "") {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }
  return fallback;
}

function normalizeStudent(student, index) {
  const name = String(getFirstValue(student, ["name", "studentName", "fullName"], "Unnamed Student")).trim();
  const roll = String(getFirstValue(student, ["roll", "rollNo", "rollNumber", "studentRoll", "id"], index + 1)).trim();
  const rawMarks = Number(getFirstValue(student, ["marks", "mark", "score"], 0));
  const marks = Number.isFinite(rawMarks) ? Math.min(100, Math.max(0, rawMarks)) : 0;

  return {
    ...student,
    name: name || "Unnamed Student",
    roll,
    marks,
    _appId: String(student?._appId ?? `student-${index}-${roll}`)
  };
}

let students = loadData("students", []);
if (!Array.isArray(students)) students = [];
students = students.map(normalizeStudent);

let requestQueue = loadData("requestQueue", []);
if (!Array.isArray(requestQueue)) requestQueue = [];
requestQueue = requestQueue.map((item, index) => {
  if (typeof item === "string") return item;
  return String(getFirstValue(item, ["text", "name", "request", "value", "label"], `Request ${index + 1}`));
});

let deletedStudent = null;
let deletedIndex = -1;
let studentSequence = Date.now();

function persistStudents() {
  return saveData("students", students);
}

function persistQueue() {
  return saveData("requestQueue", requestQueue);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}

function performanceFor(marks) {
  if (marks >= 80) return { label: "Excellent", className: "excellent" };
  if (marks >= 60) return { label: "Good", className: "good" };
  return { label: "Needs improvement", className: "improve" };
}

function formatMarks(marks) {
  return Number.isInteger(marks) ? String(marks) : marks.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function renderStats() {
  const total = students.length;
  const average = total
    ? students.reduce((sum, student) => sum + student.marks, 0) / total
    : 0;

  const top = total
    ? students.reduce((best, student) => student.marks > best.marks ? student : best)
    : null;

  $("totalStudents").textContent = total;
  $("averageMarks").innerHTML = `${average.toFixed(1)}<span class="unit">/100</span>`;
  $("topPerformer").textContent = top ? top.name : "—";
  $("topPerformerNote").textContent = top ? `${formatMarks(top.marks)} marks` : "Highest marks";
  $("queueLength").textContent = requestQueue.length;
}

function renderSnapshot() {
  const total = students.length;
  const excellent = students.filter((student) => student.marks >= 80).length;
  const good = students.filter((student) => student.marks >= 60 && student.marks < 80).length;
  const improve = total - excellent - good;

  const groups = [
    ["excellentCount", "excellentBar", excellent],
    ["goodCount", "goodBar", good],
    ["improveCount", "improveBar", improve]
  ];

  groups.forEach(([countId, barId, count]) => {
    $(countId).textContent = count;
    $(barId).style.width = total ? `${(count / total) * 100}%` : "0%";
  });
}

function getVisibleStudents() {
  const query = $("searchInput").value.trim().toLowerCase();
  const sort = $("sortSelect").value;

  const filtered = students.filter((student) =>
    student.name.toLowerCase().includes(query) ||
    student.roll.toLowerCase().includes(query)
  );

  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "roll") {
    filtered.sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
  }
  if (sort === "marksDesc") filtered.sort((a, b) => b.marks - a.marks);
  if (sort === "marksAsc") filtered.sort((a, b) => a.marks - b.marks);

  return filtered;
}

function renderTable() {
  const visible = getVisibleStudents();
  const body = $("studentTableBody");
  const empty = $("emptyState");

  body.innerHTML = visible.map((student) => {
    const performance = performanceFor(student.marks);
    return `
      <tr>
        <td>
          <div class="student-cell">
            <span class="student-avatar">${escapeHTML(initials(student.name))}</span>
            <span><span class="student-name">${escapeHTML(student.name)}</span>
              <small class="student-sub">Student record</small></span>
          </div>
        </td>
        <td>${escapeHTML(student.roll)}</td>
        <td><span class="marks-value">${escapeHTML(formatMarks(student.marks))}</span><span class="student-sub">/100</span></td>
        <td><span class="performance ${performance.className}">${performance.label}</span></td>
        <td><button class="delete-btn" type="button" data-delete="${escapeHTML(student._appId)}" aria-label="Delete ${escapeHTML(student.name)}">Delete</button></td>
      </tr>`;
  }).join("");

  empty.classList.toggle("visible", visible.length === 0);
  $("recordCount").textContent = `${students.length} ${students.length === 1 ? "record" : "records"}`;
  $("tableSummary").textContent = `Showing ${visible.length} of ${students.length} students`;
  $("undoButton").disabled = !deletedStudent;
}

function renderMarksChart() {
  const chart = $("marksChart");

  if (students.length === 0) {
    chart.innerHTML = '<p class="chart-empty">Add students to see the marks chart.</p>';
    return;
  }

  const displayed = [...students]
    .sort((a, b) => b.marks - a.marks)
    .slice(0, 10);

  chart.innerHTML = displayed.map((student) => `
    <div class="chart-column" title="${escapeHTML(student.name)}: ${escapeHTML(formatMarks(student.marks))} marks">
      <span class="chart-bar-value">${escapeHTML(formatMarks(student.marks))}</span>
      <div class="chart-bar" style="height:${Math.max(3, student.marks)}%"></div>
      <span class="chart-bar-label">${escapeHTML(student.name.split(/\s+/)[0])}</span>
    </div>`).join("");
}

function renderGradeChart() {
  const chart = $("gradeChart");
  const total = students.length;

  const groups = [
    { label: "Excellent", range: "80–100", count: students.filter((s) => s.marks >= 80).length, cls: "blue-fill" },
    { label: "Good", range: "60–79", count: students.filter((s) => s.marks >= 60 && s.marks < 80).length, cls: "green-fill" },
    { label: "Needs improvement", range: "0–59", count: students.filter((s) => s.marks < 60).length, cls: "orange-fill" }
  ];

  chart.innerHTML = groups.map((group) => `
    <div class="grade-row">
      <span>${group.label}</span>
      <div class="progress-track" title="${group.count} students">
        <div class="progress-fill ${group.cls}" style="width:${total ? (group.count / total) * 100 : 0}%"></div>
      </div>
      <span class="grade-number">${group.count}</span>
    </div>`).join("");
}

function renderQueue() {
  const visual = $("queueVisual");

  if (requestQueue.length === 0) {
    visual.innerHTML = '<p class="queue-empty">Your queue is empty. Add a request to begin.</p>';
  } else {
    visual.innerHTML = requestQueue.map((request, index) => `
      ${index ? '<span class="queue-arrow" aria-hidden="true">→</span>' : ""}
      <div class="queue-item">
        <small>${index === 0 ? "FRONT · NEXT TO PROCESS" : `QUEUE POSITION ${index + 1}`}</small>
        <strong>${escapeHTML(request)}</strong>
      </div>`).join("");
  }

  $("dequeueButton").disabled = requestQueue.length === 0;
}

function renderAll() {
  renderStats();
  renderSnapshot();
  renderTable();
  renderMarksChart();
  renderGradeChart();
  renderQueue();
}

$("studentForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("studentName").value.trim();
  const roll = $("studentRoll").value.trim();
  const marks = Number($("studentMarks").value);
  const error = $("formError");

  error.textContent = "";

  if (!name || !roll) {
    error.textContent = "Please enter both the student name and roll number.";
    return;
  }

  if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
    error.textContent = "Marks must be between 0 and 100.";
    return;
  }

  if (students.some((student) => student.roll.toLowerCase() === roll.toLowerCase())) {
    error.textContent = "This roll number already exists. Please use a unique roll number.";
    return;
  }

  const student = {
    name,
    roll,
    marks,
    _appId: `student-${++studentSequence}`
  };

  students.push(student);

  if (!persistStudents()) {
    students.pop();
    return;
  }

  $("studentForm").reset();
  $("searchInput").value = "";
  $("sortSelect").value = "default";
  renderAll();
});

$("studentForm").addEventListener("reset", () => {
  $("formError").textContent = "";
});

$("searchInput").addEventListener("input", renderTable);
$("sortSelect").addEventListener("change", renderTable);

$("studentTableBody").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  const index = students.findIndex((student) => student._appId === button.dataset.delete);
  if (index < 0) return;

  const removed = students[index];
  students.splice(index, 1);

  if (!persistStudents()) {
    students.splice(index, 0, removed);
    renderAll();
    return;
  }

  deletedStudent = removed;
  deletedIndex = index;
  renderAll();
});

$("undoButton").addEventListener("click", () => {
  if (!deletedStudent) return;

  if (students.some((student) => student.roll.toLowerCase() === deletedStudent.roll.toLowerCase())) {
    alert("Undo is unavailable because this roll number is already in use.");
    return;
  }

  const restoreAt = Math.max(0, Math.min(deletedIndex, students.length));
  students.splice(restoreAt, 0, deletedStudent);

  if (!persistStudents()) {
    students.splice(restoreAt, 1);
    return;
  }

  deletedStudent = null;
  deletedIndex = -1;
  renderAll();
});

$("queueForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("queueInput");
  const request = input.value.trim();
  if (!request) return;

  requestQueue.push(request);

  if (!persistQueue()) {
    requestQueue.pop();
    return;
  }

  input.value = "";
  renderAll();
});

$("dequeueButton").addEventListener("click", () => {
  if (requestQueue.length === 0) return;

  const processed = requestQueue.shift();

  if (!persistQueue()) {
    requestQueue.unshift(processed);
    return;
  }

  renderAll();
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

renderAll();