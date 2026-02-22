/* ===============================
   API + Auth (Admin/User)
   =============================== */
const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : "https://cuestionariocobas50.onrender.com";

let authToken = localStorage.getItem("token") || "";
let authRole = localStorage.getItem("role") || "";

function setAuth(token, role) {
  authToken = token || "";
  authRole = role || "";
  localStorage.setItem("token", authToken);
  localStorage.setItem("role", authRole);
}

function clearAuth() {
  authToken = "";
  authRole = "";
  localStorage.removeItem("token");
  localStorage.removeItem("role");
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return fetch(API_BASE + path, { ...options, headers });
}

/* ===============================
   UI Elements
   =============================== */
const quizListEl = document.getElementById("quizList");
const quizTitleEl = document.getElementById("quizTitle");
const questionsEl = document.getElementById("questions");
const resultEl = document.getElementById("result");

const fileInputEl = document.getElementById("fileInput");
const btnImportEl = document.getElementById("btnImport");
const btnGradeEl = document.getElementById("btnGrade");
const btnRetryEl = document.getElementById("btnRetry");

const modeEl = document.getElementById("mode");
const nEl = document.getElementById("n");
const randomEl = document.getElementById("random");

const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const btnExportBackup = document.getElementById("btnExportBackup");

const userBtn = document.getElementById("userBtn");
const userMenu = document.getElementById("userMenu");
const userBox = document.getElementById("userBox");
const userInfo = document.getElementById("userInfo");

function setUserMenu(open) {
  if (!userMenu) return;
  userMenu.classList.toggle("hidden", !open);
}

userBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = !userMenu.classList.contains("hidden");
  setUserMenu(!isOpen);
});

document.addEventListener("click", (e) => {
  if (!userBox) return;
  if (!userBox.contains(e.target)) setUserMenu(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setUserMenu(false);
});

/* ===============================
   State
   =============================== */
let currentQuizId = null;
let currentQuestions = [];
let lastWrongIds = [];

/* ===============================
   Role UI
   =============================== */
function applyRoleUI() {
  const isAdmin = authRole === "admin";

  btnImportEl.style.display = isAdmin ? "" : "none";
  btnExportBackup.style.display = isAdmin ? "" : "none";

  if (fileInputEl?.parentElement) {
    fileInputEl.parentElement.style.display = isAdmin ? "" : "none";
  }

  btnLogin.style.display = authToken ? "none" : "";
  btnLogout.style.display = authToken ? "" : "none";

  if (userInfo) {
    userInfo.textContent = authToken
      ? `Sesión activa (${authRole || "user"})`
      : "Modo público (sin sesión)";
  }
}

/* ===============================
   Login / Logout
   =============================== */
btnLogin.onclick = async () => {
  try {
    const email = (loginEmail.value || "").trim();
    const password = (loginPass.value || "").trim();
    if (!email || !password) return alert("Email y password requeridos");

    const r = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || "Login error");

    setAuth(j.token, j.user?.role || "");
    applyRoleUI();
    setUserMenu(false);

    await loadQuizzesFromAPI();
  } catch (e) {
    console.error(e);
    alert("Error login: " + (e?.message || e));
  }
};

btnLogout.onclick = async () => {
  clearAuth();
  applyRoleUI();
  setUserMenu(false);

  quizListEl.innerHTML = "";
  questionsEl.innerHTML = "";
  quizTitleEl.textContent = "Selecciona un cuestionario";
  resultEl.textContent = "";
  currentQuizId = null;
  currentQuestions = [];
  lastWrongIds = [];
  btnRetryEl.disabled = true;

  try {
    await loadQuizzesFromAPI();
  } catch (e) {
    console.error(e);
    alert(
      "No pude cargar los cuestionarios públicos. Revisa si el backend está encendido."
    );
  }
};

/* ===============================
   Quiz selection logic (N/random)
   =============================== */
function getLimit() {
  const v = (modeEl.value || "").toLowerCase().trim();
  const isAll =
    modeEl.selectedIndex === 0 || v === "all" || v.includes("completo");
  if (isAll) return null;
  const n = Math.max(1, parseInt(nEl.value || "50", 10));
  return n;
}

function stableSeed(quizId, limit, randomize) {
  const key = `${quizId}:${limit ?? "all"}:${randomize ? 1 : 0}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

function sampleStable(arr, n, seed) {
  const a = arr.slice();
  let x = seed || 123456789;
  function rnd() {
    x = (1103515245 * x + 12345) >>> 0;
    return x / 0xffffffff;
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function pickQuestions(questions, quizId) {
  const limit = getLimit();
  if (!limit) return questions;
  const n = Math.min(limit, questions.length);
  if (!randomEl.checked) return questions.slice(0, n);
  const seed = stableSeed(quizId, limit, true);
  return sampleStable(questions, n, seed);
}

/* ===============================
   Render UI
   =============================== */
function renderQuizList(quizzes) {
  quizListEl.innerHTML = "";

  for (const q of quizzes) {
    const li = document.createElement("li");
    li.dataset.id = String(q.id);
    li.style.cursor = "pointer";
    li.style.userSelect = "none";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = q.title;
    li.appendChild(titleSpan);

    if (authRole === "admin") {
      const del = document.createElement("button");
      del.className = "btn ghost";
      del.textContent = "Eliminar";
      del.style.marginLeft = "10px";

      del.onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm(`¿Eliminar cuestionario "${q.title}"?`)) return;

        const r = await apiFetch(`/admin/quizzes/${q.id}`, { method: "DELETE" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return alert(j.error || "No se pudo eliminar");

        // Recargar lista (usando apiFetch para respetar auth si aplica)
        const r2 = await apiFetch("/public/quizzes");
        const j2 = await r2.json().catch(() => ({}));
        const list = j2.quizzes || [];
        renderQuizList(list);

        // Si se borró el que estaba abierto, seleccionar otro
        if (String(currentQuizId) === String(q.id)) {
          if (list.length > 0) {
            const nextId = list[0].id;
            const firstLi = quizListEl.querySelector(`li[data-id="${nextId}"]`);
            if (firstLi) firstLi.classList.add("active");
            await openQuiz(nextId);
          } else {
            quizTitleEl.textContent = "Selecciona un cuestionario";
            questionsEl.innerHTML = "";
            resultEl.textContent = "";
            currentQuizId = null;
            currentQuestions = [];
            lastWrongIds = [];
            btnRetryEl.disabled = true;
          }
        }
      };

      li.appendChild(del);
    }

    li.addEventListener("click", async () => {
      document
        .querySelectorAll("#quizList li")
        .forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
      await openQuiz(q.id);
    });

    quizListEl.appendChild(li);
  }
}

function renderQuestions(qs) {
  questionsEl.innerHTML = "";

  for (let idx = 0; idx < qs.length; idx++) {
    const q = qs[idx];

    const card = document.createElement("div");
    card.className = "qcard";
    card.dataset.qid = q.id;

    // correctIndex para feedback instantáneo
    card.dataset.correct =
      q.correct && q.correct.length ? String(q.correct[0]) : "";

    // ⚠️ IMPORTANTE: no conviertas null a 0
    const tag =
      q.origNo !== null && q.origNo !== undefined && Number(q.origNo) > 0
        ? Number(q.origNo)
        : idx + 1;

    const top = document.createElement("div");
    top.className = "qtop";

    const title = document.createElement("div");
    title.className = "qtitle";
    title.textContent = `${tag}. ${q.prompt}`;

    const actions = document.createElement("div");
    actions.className = "qactions";

    if (authRole === "admin") {
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn";
      btnEdit.textContent = "Editar";
      btnEdit.onclick = () => openEditModal(q);
      actions.appendChild(btnEdit);

      const btnDel = document.createElement("button");
      btnDel.className = "btn ghost";
      btnDel.textContent = "Eliminar";
      btnDel.onclick = async () => {
        if (!confirm("¿Eliminar esta pregunta?")) return;

        const r = await apiFetch(`/admin/questions/${q.id}`, { method: "DELETE" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return alert(j.error || "No se pudo eliminar");

        await openQuiz(currentQuizId);
      };
      actions.appendChild(btnDel);
    }

    top.appendChild(title);
    top.appendChild(actions);
    card.appendChild(top);

    if (q.image) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "qimg";
      const img = document.createElement("img");
      img.src = q.image;
      img.alt = `Imagen pregunta ${tag}`;
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
    }

    const optsDiv = document.createElement("div");
    optsDiv.className = "opts";

    function applyInstantFeedback(selectedIndex) {
      const correctIndex = parseInt(card.dataset.correct || "-1", 10);

      card.classList.remove("ok", "bad");
      optsDiv.querySelectorAll(".opt").forEach((el) => {
        el.classList.remove("good", "wrong", "correct");
      });

      if (correctIndex >= 0) {
        const correctRow = optsDiv.querySelector(
          `.opt[data-opt="${correctIndex}"]`
        );
        if (correctRow) correctRow.classList.add("correct");
      }

      const selectedRow = optsDiv.querySelector(
        `.opt[data-opt="${selectedIndex}"]`
      );

      if (selectedIndex === correctIndex) {
        selectedRow?.classList.add("good");
        card.classList.add("ok");
      } else {
        selectedRow?.classList.add("wrong");
        card.classList.add("bad");
      }
    }

    for (const opt of q.options) {
      const row = document.createElement("div");
      row.className = "opt";
      row.dataset.opt = String(opt.i);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q_${q.id}`;
      input.value = opt.i;

      const lab = document.createElement("label");
      lab.textContent = opt.t;

      row.onclick = () => {
        input.checked = true;
        applyInstantFeedback(opt.i);
      };

      lab.onclick = (ev) => {
        ev.preventDefault();
        input.checked = true;
        applyInstantFeedback(opt.i);
      };

      row.appendChild(input);
      row.appendChild(lab);
      optsDiv.appendChild(row);
    }

    card.appendChild(optsDiv);
    questionsEl.appendChild(card);
  }
}

/* ===============================
   API: load quizzes + open quiz
   =============================== */
async function loadQuizzesFromAPI() {
  const r = await apiFetch("/public/quizzes");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Error listando quizzes");
  renderQuizList(j.quizzes || []);
}

async function openQuizFromAPI(quizId) {
  currentQuizId = quizId;

  const r = await apiFetch(`/public/quizzes/${quizId}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Error cargando quiz");

  // backend devuelve directo: { id,title,questions }
  const quiz = j.quiz || j;

  quizTitleEl.textContent = quiz.title || "Cuestionario";
  resultEl.textContent = "";
  lastWrongIds = [];
  btnRetryEl.disabled = true;

  const normalized = (quiz.questions || []).map((q) => {
    // ⚠️ NO uses "q.origNo || 0" porque convierte null a 0 y luego te sale "0."
    const safeOrigNo =
      typeof q.origNo === "number" && Number.isFinite(q.origNo) && q.origNo > 0
        ? q.origNo
        : null;

    const optionsNorm = (q.options || []).map((o, idx) => ({
      i: o.optIndex ?? o.i ?? idx,
      t: o.text ?? o.t ?? "",
      isCorrect: o.isCorrect,
    }));

    const correctNorm =
      Array.isArray(q.correct) && q.correct.length
        ? q.correct
        : optionsNorm
            .filter((o) => o.isCorrect === 1)
            .map((o) => o.i);

    return {
      id: q.id,
      origNo: safeOrigNo,
      prompt: q.prompt || "",
      options: optionsNorm.map((o) => ({ i: o.i, t: o.t })),
      correct: correctNorm,
      image: q.imageUrl || q.image || "",
    };
  });

  // Orden estable
  normalized.sort((a, b) => {
    const ao = a.origNo ?? 999999;
    const bo = b.origNo ?? 999999;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  });

  currentQuestions = pickQuestions(normalized, quizId);
  renderQuestions(currentQuestions);

  // limpia flotante resultado cuando cambias quiz
  try {
    fabRetry.disabled = true;
    fabResult.style.display = "none";
    fabResult.textContent = "";
  } catch {}
}

// Alias para renderQuizList
const openQuiz = (id) => openQuizFromAPI(id);

/* ===============================
   Grading (local)
   =============================== */
function collectAnswers() {
  const answers = {};
  for (const q of currentQuestions) {
    const checked = document.querySelector(`input[name="q_${q.id}"]:checked`);
    answers[String(q.id)] = checked ? parseInt(checked.value, 10) : null;
  }
  return answers;
}

function gradeLocal() {
  const answers = collectAnswers();
  let total = 0;
  let correct = 0;
  const wrong = [];

  for (const q of currentQuestions) {
    total++;
    const sel = answers[String(q.id)];
    const ok = sel !== null && q.correct.includes(sel);
    if (ok) correct++;
    else wrong.push(q.id);

    const card = document.querySelector(`.qcard[data-qid="${q.id}"]`);
    if (card) {
      card.classList.remove("ok", "bad");
      card.classList.add(ok ? "ok" : "bad");
    }
  }

  const score = total ? (correct / total) * 100 : 0;
  resultEl.textContent = `Resultado: ${correct}/${total} (${score.toFixed(1)}%)`;
  lastWrongIds = wrong;
  btnRetryEl.disabled = wrong.length === 0;
}

function retryWrong() {
  const set = new Set(lastWrongIds);
  const filtered = currentQuestions.filter((q) => set.has(q.id));
  resultEl.textContent = "Reintentando solo falladas…";
  renderQuestions(filtered);
}

/* ===============================
   Import XML (Admin) -> Backend JSON
   =============================== */
btnImportEl.onclick = async () => {
  try {
    if (authRole !== "admin") return alert("Solo admin puede importar");

    const f = fileInputEl.files?.[0];
    if (!f) return alert("Selecciona un XML");

    const text = await f.text();
    const parsed = await parseDaypoXmlText(text);

    const r = await apiFetch("/admin/quizzes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: parsed.title, items: parsed.items }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || "Error importando quiz");

    await loadQuizzesFromAPI();
    await openQuizFromAPI(j.quiz.id);
  } catch (e) {
    console.error(e);
    alert("Error importando: " + (e?.message || e));
  }
};

/* ===============================
   Buttons + FABs
   =============================== */
btnGradeEl.onclick = () => {
  if (!currentQuizId) return alert("Selecciona un cuestionario");
  gradeLocal();
};

btnRetryEl.onclick = () => retryWrong();

const fabGrade = document.getElementById("fabGrade");
const fabRetry = document.getElementById("fabRetry");
const fabResult = document.getElementById("fabResult");

function scrollToQuizTop() {
  const header = document.querySelector(".content-head");
  if (header) {
    header.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

fabGrade.onclick = () => {
  btnGradeEl.click();
  scrollToQuizTop();
};

fabRetry.onclick = () => {
  btnRetryEl.click();
  scrollToQuizTop();
};

function syncFabResult() {
  const txt = (resultEl.textContent || "").trim();
  if (!txt) {
    fabResult.style.display = "none";
    fabResult.textContent = "";
    return;
  }
  fabResult.style.display = "";
  fabResult.textContent = txt;
}

// Hook al calificar para sincronizar flotante
const _gradeLocal = gradeLocal;
gradeLocal = function () {
  _gradeLocal();
  fabRetry.disabled = btnRetryEl.disabled;
  syncFabResult();
};

// Al reintentar, también sincroniza
const _retryWrong = retryWrong;
retryWrong = function () {
  _retryWrong();
  // normalmente no hay score, ocultamos el badge si quieres:
  // syncFabResult();
};

modeEl.onchange = () => {
  if (currentQuizId) openQuizFromAPI(currentQuizId);
};
nEl.onchange = () => {
  if (currentQuizId) openQuizFromAPI(currentQuizId);
};
randomEl.onchange = () => {
  if (currentQuizId) openQuizFromAPI(currentQuizId);
};

/* ===============================
   Export (quiz actual) desde API
   =============================== */
btnExportBackup.onclick = async () => {
  try {
    if (!currentQuizId) return alert("Selecciona un cuestionario para exportar");

    const r = await apiFetch(`/public/quizzes/${currentQuizId}`);
    const full = await r.json().catch(() => ({}));
    if (!r.ok) return alert(full.error || "Error exportando quiz");

    const blob = new Blob([JSON.stringify(full, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz_${currentQuizId}.json`;
    a.click();

    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("Error exportando: " + (e?.message || e));
  }
};

/* ===============================
   Modal (Admin edit + upload image)
   =============================== */
let modalQ = null;

const editModal = document.getElementById("editModal");
const editBackdrop = document.getElementById("editBackdrop");
const editClose = document.getElementById("editClose");
const editCancel = document.getElementById("editCancel");
const editSave = document.getElementById("editSave");

const editPrompt = document.getElementById("editPrompt");
const editOptions = document.getElementById("editOptions");
const editCorrect = document.getElementById("editCorrect");
const editHint = document.getElementById("editHint");
const editImgFile = document.getElementById("editImgFile");
const editImgClear = document.getElementById("editImgClear");
const editImgPreview = document.getElementById("editImgPreview");
const editImgTag = document.getElementById("editImgTag");
const editImgWarn = document.getElementById("editImgWarn");

let modalSelectedFile = null;

function showModal() {
  editModal.classList.remove("hidden");
  editModal.setAttribute("aria-hidden", "false");
  setTimeout(() => editPrompt.focus(), 0);
}

function hideModal() {
  editModal.classList.add("hidden");
  editModal.setAttribute("aria-hidden", "true");
  modalQ = null;
  modalSelectedFile = null;
}

function updateCorrectHint() {
  const lines = editOptions.value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const n = Math.max(1, lines.length);
  editCorrect.max = String(n);
  editHint.textContent = `Opciones detectadas: ${n}. La correcta debe estar entre 1 y ${n}.`;
}

function updateImageAvailabilityFromPrompt() {
  editImgFile.disabled = false;
  editImgClear.disabled = false;
  editImgWarn.textContent =
    "La imagen se guarda asociada a esta pregunta (ID en la base de datos).";
}

function openEditModal(q) {
  if (authRole !== "admin") return;

  modalQ = q;

  // ✅ SOLO enunciado (sin numerales). Mantener saltos de línea.
  editPrompt.value = (q.prompt || "").replace(/\r\n/g, "\n");

  editOptions.value = (q.options || []).map((o) => o.t).join("\n");

  const def = q.correct && q.correct.length ? q.correct[0] + 1 : 1;
  editCorrect.min = "1";
  editCorrect.value = String(def);

  updateCorrectHint();

  modalSelectedFile = null;
  editImgFile.value = "";

  if (q.image) {
    editImgTag.src = q.image;
    editImgPreview.classList.remove("hidden");
  } else {
    editImgTag.removeAttribute("src");
    editImgPreview.classList.add("hidden");
  }

  updateImageAvailabilityFromPrompt();
  showModal();
}

editOptions.addEventListener("input", updateCorrectHint);
editPrompt.addEventListener("input", updateImageAvailabilityFromPrompt);

editImgFile.addEventListener("change", async () => {
  if (!modalQ) return;
  const file = editImgFile.files?.[0];
  if (!file) return;
  modalSelectedFile = file;

  const dataUrl = await readFileAsDataURL(file);
  editImgTag.src = dataUrl;
  editImgPreview.classList.remove("hidden");
});

editImgClear.addEventListener("click", async () => {
  try {
    if (!modalQ) return;
    if (authRole !== "admin") return alert("Solo admin");

    const r = await apiFetch(`/admin/questions/${modalQ.id}/image`, {
      method: "DELETE",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || "Error eliminando imagen");

    modalSelectedFile = null;
    editImgFile.value = "";
    editImgTag.removeAttribute("src");
    editImgPreview.classList.add("hidden");

    await openQuizFromAPI(currentQuizId);
  } catch (e) {
    console.error(e);
    alert("Error eliminando: " + (e?.message || e));
  }
});

editBackdrop.addEventListener("click", hideModal);
editClose.addEventListener("click", hideModal);
editCancel.addEventListener("click", hideModal);

document.addEventListener("keydown", (e) => {
  if (!editModal.classList.contains("hidden") && e.key === "Escape") hideModal();
});

editSave.addEventListener("click", async () => {
  try {
    if (!modalQ) return;
    if (authRole !== "admin") return alert("Solo admin");

    // ✅ Mantener saltos de línea y limpiar \r\n
    const rawPrompt = (editPrompt.value || "").replace(/\r\n/g, "\n").trim();
    const { origNo, clean } = extractOrigNoAndClean(rawPrompt);

    const opts = editOptions.value
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!clean) return alert("El enunciado no puede estar vacío.");
    if (opts.length < 2) return alert("Debes tener al menos 2 opciones.");

    const ci = parseInt(editCorrect.value || "1", 10) - 1;
    if (Number.isNaN(ci) || ci < 0 || ci >= opts.length)
      return alert("Índice correcta inválido.");

    // ✅ Paso 3: origNo seguro (solo 1..N)
    const safeOrigNo =
      typeof origNo === "number" && Number.isFinite(origNo) && origNo > 0
        ? origNo
        : null;

    // ✅ Paso 4: guardar con safeOrigNo
    const r1 = await apiFetch(`/admin/questions/${modalQ.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: clean,       // se guarda el texto sin "123."
        origNo: safeOrigNo,  // se guarda el numeral en campo separado
        options: opts,
        correctIndex: ci,
      }),
    });

    const j1 = await r1.json().catch(() => ({}));
    if (!r1.ok) return alert(j1.error || "Error guardando pregunta");

    if (modalSelectedFile) {
      const fd = new FormData();
      fd.append("file", modalSelectedFile);

      const r2 = await apiFetch(`/admin/questions/${modalQ.id}/image`, {
        method: "POST",
        body: fd,
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) return alert(j2.error || "Error subiendo imagen");
    }

    hideModal();
    await openQuizFromAPI(currentQuizId);
  } catch (e) {
    console.error(e);
    alert("Error guardando: " + (e?.message || e));
  }
});

/* ===============================
   Helpers
   =============================== */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/* ===============================
   Daypo XML parsing -> JSON items
   =============================== */
function extractOrigNoAndClean(text) {
  let s = (text || "").replace(/\r\n/g, "\n").trim();
  let origNo = null;

  const m = s.match(/^\s*(\d+)\s*[\.\)]\s+/); // "123. " o "123) "
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > 0) origNo = n;
    s = s.replace(m[0], "");
  }

  return { origNo, clean: s.trim() };
}

function codeToCorrectIndices(code, nOpts) {
  let c = (code || "").trim();
  if (!c) return [];
  if (c.length < nOpts) c = c.padEnd(nOpts, "1");
  if (c.length > nOpts) c = c.slice(0, nOpts);
  const out = [];
  for (let i = 0; i < c.length; i++) if (c[i] === "2") out.push(i);
  return out;
}

async function parseDaypoXmlText(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const pe = doc.querySelector("parsererror");
  if (pe)
    throw new Error(
      "XML inválido o corrupto (parsererror). Revisa el export de Daypo."
    );

  const titleNode = doc.querySelector("p > t");
  const title = (titleNode?.textContent || "Cuestionario").trim();

  const root = doc.documentElement;
  const container = Array.from(root.children).find(
    (x) => x.tagName.toLowerCase() === "c"
  );
  if (!container) throw new Error("No se encontró el nodo <c> contenedor de preguntas.");

  const items = [];
  const qnodes = Array.from(container.children);

  for (const qnode of qnodes) {
    const pEl = Array.from(qnode.children).find(
      (x) => x.tagName.toLowerCase() === "p"
    );
    const pText = (pEl?.textContent || "").trim();
    const { origNo, clean } = extractOrigNoAndClean(pText);

    const rEl = Array.from(qnode.children).find(
      (x) => x.tagName.toLowerCase() === "r"
    );
    const options = rEl
      ? Array.from(rEl.children)
          .map((x) => (x.textContent || "").trim())
          .filter(Boolean)
      : [];

    let code = "";
    for (const child of Array.from(qnode.children)) {
      if (child.tagName.toLowerCase() === "c") {
        code = (child.textContent || "").trim();
        break;
      }
    }
    const correct = codeToCorrectIndices(code, options.length);

    if (clean && options.length >= 2) {
      items.push({ origNo, prompt: clean, options, correct });
    }
  }

  return { title, items };
}

/* ===============================
   Boot
   =============================== */
(async function boot() {
  try {
    applyRoleUI();
    await loadQuizzesFromAPI();
  } catch (e) {
    console.warn("Boot warning:", e?.message || e);
  }
})();