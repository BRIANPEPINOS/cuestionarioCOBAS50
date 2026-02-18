// ===============================
// IndexedDB (Offline DB)
// ===============================
const DB_NAME = "daypo_offline_db";
const DB_VER = 2;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);

        req.onupgradeneeded = () => {
            const db = req.result;

            // quizzes: {id, title, createdAt}
            if (!db.objectStoreNames.contains("quizzes")) {
                const s = db.createObjectStore("quizzes", { keyPath: "id", autoIncrement: true });
                s.createIndex("title", "title", { unique: false });
            }

            // questions: {id, quizId, origNo, prompt, explanation}
            if (!db.objectStoreNames.contains("questions")) {
                const s = db.createObjectStore("questions", { keyPath: "id", autoIncrement: true });
                s.createIndex("quizId", "quizId", { unique: false });
                s.createIndex("origNo", "origNo", { unique: false });
            }

            // options: {id, questionId, optIndex, text, isCorrect}
            if (!db.objectStoreNames.contains("options")) {
                const s = db.createObjectStore("options", { keyPath: "id", autoIncrement: true });
                s.createIndex("questionId", "questionId", { unique: false });
            }

            // images: {origNo, dataUrl, mime}  (clave: origNo para mantener numeración aunque sea aleatorio)
            if (!db.objectStoreNames.contains("images")) {
                db.createObjectStore("images", { keyPath: "origNo" });
            }
            // images2: {questionId, dataUrl, mime}  (clave: questionId)
            if (!db.objectStoreNames.contains("images2")) {
                db.createObjectStore("images2", { keyPath: "questionId" });
            }

        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function tx(db, storeName, mode, fn) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const result = fn(store, t);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
    });
}

async function addQuiz(db, title) {
    const createdAt = new Date().toISOString();
    const id = await new Promise((resolve, reject) => {
        const t = db.transaction("quizzes", "readwrite");
        const s = t.objectStore("quizzes");
        const req = s.add({ title, createdAt });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return id;
}

async function listQuizzes(db) {
    return await new Promise((resolve, reject) => {
        const t = db.transaction("quizzes", "readonly");
        const s = t.objectStore("quizzes");
        const req = s.getAll();
        req.onsuccess = () => {
            const arr = req.result || [];
            arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", "es", { sensitivity: "base" }));
            resolve(arr);
        };
        req.onerror = () => reject(req.error);
    });
}

async function addQuestion(db, quizId, origNo, prompt, explanation = "") {
    return await new Promise((resolve, reject) => {
        const t = db.transaction("questions", "readwrite");
        const s = t.objectStore("questions");
        const req = s.add({ quizId, origNo, prompt, explanation });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function addOption(db, questionId, optIndex, text, isCorrect) {
    return await new Promise((resolve, reject) => {
        const t = db.transaction("options", "readwrite");
        const s = t.objectStore("options");
        const req = s.add({ questionId, optIndex, text, isCorrect: isCorrect ? 1 : 0 });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadQuizFull(db, quizId) {
    const quiz = await new Promise((resolve, reject) => {
        const t = db.transaction("quizzes", "readonly");
        const s = t.objectStore("quizzes");
        const req = s.get(quizId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    if (!quiz) throw new Error("Quiz no encontrado");

    const questions = await new Promise((resolve, reject) => {
        const t = db.transaction("questions", "readonly");
        const s = t.objectStore("questions");
        const idx = s.index("quizId");
        const req = idx.getAll(quizId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    // ordenar por id como "orden original de importación"
    questions.sort((a, b) => a.id - b.id);

    // cargar options por question
    const optAll = await new Promise((resolve, reject) => {
        const t = db.transaction("options", "readonly");
        const s = t.objectStore("options");
        const req = s.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    const byQ = new Map();
    for (const o of optAll) {
        if (!byQ.has(o.questionId)) byQ.set(o.questionId, []);
        byQ.get(o.questionId).push(o);
    }
    for (const [qid, arr] of byQ.entries()) arr.sort((a, b) => a.optIndex - b.optIndex);

 // cargar imágenes por questionId
    const images2 = await new Promise((resolve, reject) => {
        const t = db.transaction("images2", "readonly");
        const s = t.objectStore("images2");
        const req = s.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    const imgByQid = new Map(images2.map(x => [x.questionId, x.dataUrl]));

    const qOut = questions.map(q => {
        const opts = byQ.get(q.id) || [];
        return {
            id: q.id,
            origNo: q.origNo || 0,
            prompt: q.prompt,
            explanation: q.explanation || "",
            options: opts.map(o => ({ i: o.optIndex, t: o.text })),
            correct: opts.filter(o => o.isCorrect === 1).map(o => o.optIndex),
            image: imgByQid.get(q.id) || ""

        };
    });

    return { id: quiz.id, title: quiz.title, questions: qOut };
}

async function updateQuestion(db, questionId, origNo, prompt, options, correctIndex) {
    await new Promise((resolve, reject) => {
        const t = db.transaction("questions", "readwrite");
        const s = t.objectStore("questions");
        const get = s.get(questionId);

        get.onsuccess = () => {
            const q = get.result;
            if (!q) return reject(new Error("Pregunta no encontrada"));
            q.prompt = prompt;
            q.origNo = origNo; // ✅ IMPORTANTE
            const put = s.put(q);
            put.onsuccess = () => resolve(true);
            put.onerror = () => reject(put.error);
        };
        get.onerror = () => reject(get.error);
    });

    // delete old options + insert new
    const allOpts = await new Promise((resolve, reject) => {
        const t = db.transaction("options", "readonly");
        const s = t.objectStore("options");
        const req = s.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    await new Promise((resolve, reject) => {
        const t = db.transaction("options", "readwrite");
        const s = t.objectStore("options");
        for (const o of allOpts) {
            if (o.questionId === questionId) s.delete(o.id);
        }
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
    });

    for (let i = 0; i < options.length; i++) {
        await addOption(db, questionId, i, options[i], i === correctIndex);
    }
}


function updateImageAvailabilityFromPrompt() {

    editImgFile.disabled = false;
    editImgClear.disabled = false;

    editImgWarn.textContent =
        "La imagen se guardará asociada a esta pregunta (por ID interno), aunque el número se repita.";
}


async function saveImageByQuestionId(db, questionId, dataUrl, mime) {
    await new Promise((resolve, reject) => {
        const t = db.transaction("images2", "readwrite");
        const s = t.objectStore("images2");
        const req = s.put({ questionId, dataUrl, mime });
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}
async function deleteImageByQuestionId(db, questionId) {
    await new Promise((resolve, reject) => {
        const t = db.transaction("images2", "readwrite");
        const s = t.objectStore("images2");
        const req = s.delete(questionId);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}


// ===============================
// Daypo XML parsing (JS)
// ===============================
function extractOrigNoAndClean(prompt) {
    const s = (prompt || "").trim();
    // acepta: "15", "15.", "15)", "15:", "15-", "15 -"
    const m = /^\s*(\d+)\s*(?:[.)\:\-]\s*)?(.*)$/.exec(s);
    if (m) return { origNo: parseInt(m[1], 10), clean: (m[2] || "").trim() };
    return { origNo: 0, clean: s };
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
    if (pe) throw new Error("XML inválido o corrupto (parsererror). Revisa el export de Daypo.");

    // Título: test > p > t
    const titleNode = doc.querySelector("p > t");
    const title = (titleNode?.textContent || "Cuestionario").trim();

    // ✅ contenedor preguntas: <c> hijo directo del root (evita agarrar el <c> de correctas)
    const root = doc.documentElement;
    const container = Array.from(root.children).find(x => x.tagName.toLowerCase() === "c");
    if (!container) throw new Error("No se encontró el nodo <c> contenedor de preguntas.");

    const items = [];
    const qnodes = Array.from(container.children);

    for (const qnode of qnodes) {
        // enunciado (hijo directo <p>)
        const pEl = Array.from(qnode.children).find(x => x.tagName.toLowerCase() === "p");
        const pText = (pEl?.textContent || "").trim();
        const { origNo, clean } = extractOrigNoAndClean(pText);

        // opciones (hijo directo <r>)
        const rEl = Array.from(qnode.children).find(x => x.tagName.toLowerCase() === "r");
        const options = rEl ? Array.from(rEl.children).map(x => (x.textContent || "").trim()).filter(Boolean) : [];

        // correctas (hijo directo <c> dentro de la pregunta)
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


// ===============================
// UI logic (offline quiz)
// ===============================
// ===============================
// UI logic (offline quiz)
// ===============================
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


let db = null;
let currentQuizId = null;
let currentQuestions = [];
let lastWrongIds = [];

function getLimit() {
    // Soporta select con values ("all"/"n") o sin values ("Completo"/"N preguntas")
    const v = (modeEl.value || "").toLowerCase().trim();
    const isAll = (modeEl.selectedIndex === 0) || (v === "all") || (v.includes("completo"));

    if (isAll) return null;

    const n = Math.max(1, parseInt(nEl.value || "50", 10));
    return n;
}


function stableSeed(quizId, limit, randomize) {
    // seed estable: no cambia solo por re-render
    const key = `${quizId}:${limit ?? "all"}:${randomize ? 1 : 0}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h;
}

function sampleStable(arr, n, seed) {
    // Fisher–Yates con RNG determinístico simple
    const a = arr.slice();
    let x = seed || 123456789;
    function rnd() { x = (1103515245 * x + 12345) >>> 0; return x / 0xFFFFFFFF; }

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

function renderQuizList(quizzes) {
    quizListEl.innerHTML = "";

    for (const q of quizzes) {
        const li = document.createElement("li");
        li.textContent = q.title;
        li.dataset.id = String(q.id);

        li.style.cursor = "pointer";
        li.style.userSelect = "none";

        li.addEventListener("click", async () => {

            // quitar selección anterior
            document.querySelectorAll("#quizList li")
                .forEach(x => x.classList.remove("active"));

            // marcar actual
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

        const tag = q.origNo ? q.origNo : (idx + 1);

        // ===== Header =====
        const top = document.createElement("div");
        top.className = "qtop"; // antes qhead

        const title = document.createElement("div");
        title.className = "qtitle";
        title.textContent = `${tag}. ${q.prompt}`;

        const actions = document.createElement("div");
        actions.className = "qactions"; // para que el CSS lo pinte bonito

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn"; // usar el estilo general
        btnEdit.textContent = "Editar";
        btnEdit.onclick = () => openEditModal(q);



        actions.appendChild(btnEdit);


        top.appendChild(title);
        top.appendChild(actions);
        card.appendChild(top);

        // ===== Image =====
        if (q.image) {
            const imgWrap = document.createElement("div");
            imgWrap.className = "qimg"; // wrapper (no la img)
            const img = document.createElement("img");
            img.src = q.image;
            img.alt = `Imagen pregunta ${tag}`;
            imgWrap.appendChild(img);
            card.appendChild(imgWrap);
        }

        // ===== Options container =====
        const optsDiv = document.createElement("div");
        optsDiv.className = "opts";

        for (const opt of q.options) {
            const row = document.createElement("div");
            row.className = "opt";

            const input = document.createElement("input");
            input.type = "radio";
            input.name = `q_${q.id}`;
            input.value = opt.i;

            const lab = document.createElement("label");
            lab.textContent = opt.t;

            // click en el row o label selecciona
            row.onclick = () => (input.checked = true);
            lab.onclick = (ev) => { ev.preventDefault(); input.checked = true; };

            row.appendChild(input);
            row.appendChild(lab);
            optsDiv.appendChild(row);
        }

        card.appendChild(optsDiv);
        questionsEl.appendChild(card);
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

async function refresh() {
    const quizzes = await listQuizzes(db);
    renderQuizList(quizzes);
}

async function openQuiz(quizId) {
    currentQuizId = quizId;
    const full = await loadQuizFull(db, quizId);
    quizTitleEl.textContent = full.title;

    lastWrongIds = [];
    btnRetryEl.disabled = true;
    resultEl.textContent = "";

    const shown = pickQuestions(full.questions, quizId);
    currentQuestions = shown;
    renderQuestions(shown);
}

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
        const ok = (sel !== null && q.correct.includes(sel));
        if (ok) correct++;
        else wrong.push(q.id);

        const card = document.querySelector(`.qcard[data-qid="${q.id}"]`);
        if (card) {
            card.classList.remove("ok", "bad");
            card.classList.add(ok ? "ok" : "bad");
        }
    }

    const score = total ? (correct / total * 100) : 0;
    resultEl.textContent = `Resultado: ${correct}/${total} (${score.toFixed(1)}%)`;
    lastWrongIds = wrong;
    btnRetryEl.disabled = wrong.length === 0;
}

function retryWrong() {
    const set = new Set(lastWrongIds);
    const filtered = currentQuestions.filter(q => set.has(q.id));
    resultEl.textContent = "Reintentando solo falladas…";
    renderQuestions(filtered);
}

// ===============================
// Import XML -> DB
// ===============================
btnImportEl.onclick = async () => {
    const f = fileInputEl.files?.[0];
    if (!f) return alert("Selecciona un XML");

    const text = await f.text();
    const parsed = await parseDaypoXmlText(text);
    console.log("TITLE:", parsed.title);
    console.log("ITEMS:", parsed.items.length);
    const quizId = await addQuiz(db, parsed.title);

    for (const it of parsed.items) {
        const qid = await addQuestion(db, quizId, it.origNo, it.prompt, "");
        for (let i = 0; i < it.options.length; i++) {
            const isCorrect = it.correct.includes(i);
            await addOption(db, qid, i, it.options[i], isCorrect);
        }
    }

    await refresh();
    await openQuiz(quizId);
};

btnGradeEl.onclick = () => {
    if (!currentQuizId) return alert("Selecciona un cuestionario");
    gradeLocal();
};

btnRetryEl.onclick = () => retryWrong();

modeEl.onchange = () => { if (currentQuizId) openQuiz(currentQuizId); };
nEl.onchange = () => { if (currentQuizId) openQuiz(currentQuizId); };
randomEl.onchange = () => { if (currentQuizId) openQuiz(currentQuizId); };

// ===============================
// Boot
// ===============================
(async function boot() {
    db = await openDB();
    await refresh();
})();

// ===== Modal state =====
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

let modalImageDataUrl = "";   // dataURL temporal elegido en el modal
let modalImageMime = "image/*";


function showModal() {
    editModal.classList.remove("hidden");
    editModal.setAttribute("aria-hidden", "false");
    // focus
    setTimeout(() => editPrompt.focus(), 0);
}

function hideModal() {
    editModal.classList.add("hidden");
    editModal.setAttribute("aria-hidden", "true");
    modalQ = null;
}

function openEditModal(q) {
    modalQ = q;

    // Mostrar el enunciado con número si ya existe
    editPrompt.value = (q.origNo && q.origNo > 0)
        ? `${q.origNo}. ${q.prompt || ""}`
        : (q.prompt || "");

    editOptions.value = (q.options || []).map(o => o.t).join("\n");

    // Correcta por defecto
    const def = (q.correct && q.correct.length) ? (q.correct[0] + 1) : 1;
    editCorrect.min = "1";
    editCorrect.value = String(def);

    updateCorrectHint();

    // Reset imagen temporal del modal
    modalImageDataUrl = "";
    modalImageMime = "image/*";

    // Preview de imagen actual (si existe)
    editImgFile.value = "";
    if (q.image) {
        editImgTag.src = q.image;
        editImgPreview.classList.remove("hidden");
    } else {
        editImgTag.removeAttribute("src");
        editImgPreview.classList.add("hidden");
    }

    // ✅ Esto debe ir AL FINAL para que habilite/bloquee según el texto actual
    updateImageAvailabilityFromPrompt();

    showModal();
}




function updateCorrectHint() {
    const lines = editOptions.value.split("\n").map(x => x.trim()).filter(Boolean);
    const n = Math.max(1, lines.length);
    editCorrect.max = String(n);
    editHint.textContent = `Opciones detectadas: ${n}. La correcta debe estar entre 1 y ${n}.`;
}

editOptions.addEventListener("input", updateCorrectHint);
editPrompt.addEventListener("input", updateImageAvailabilityFromPrompt);

editImgFile.addEventListener("change", async () => {
    if (!modalQ) return;
    const file = editImgFile.files?.[0];
    if (!file) return;

    modalImageMime = file.type || "image/*";
    modalImageDataUrl = await readFileAsDataURL(file);

    editImgTag.src = modalImageDataUrl;
    editImgPreview.classList.remove("hidden");
});

editImgClear.addEventListener("click", async () => {
    if (!modalQ) return;

    await deleteImageByQuestionId(db, modalQ.id);

    // limpia preview
    modalImageDataUrl = "";
    editImgFile.value = "";
    editImgTag.removeAttribute("src");
    editImgPreview.classList.add("hidden");

    // refrescar tarjeta
    await openQuiz(currentQuizId);
});


// cerrar modal
editBackdrop.addEventListener("click", hideModal);
editClose.addEventListener("click", hideModal);
editCancel.addEventListener("click", hideModal);

document.addEventListener("keydown", (e) => {
    if (!editModal.classList.contains("hidden") && e.key === "Escape") hideModal();
});

editSave.addEventListener("click", async () => {
    try {
        if (!modalQ) return;

        const rawPrompt = (editPrompt.value || "").trim();
        const { origNo, clean } = extractOrigNoAndClean(rawPrompt);

        const opts = editOptions.value
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        if (!clean) return alert("El enunciado no puede estar vacío.");
        if (opts.length < 2) return alert("Debes tener al menos 2 opciones.");

        const ci = parseInt(editCorrect.value || "1", 10) - 1;
        if (Number.isNaN(ci) || ci < 0 || ci >= opts.length) {
            return alert("Índice correcta inválido.");
        }

        // ✅ guardar texto/opciones
        await updateQuestion(db, modalQ.id, origNo, clean, opts, ci);

        // ✅ guardar imagen por questionId (sin depender de origNo)
        if (modalImageDataUrl) {
            await saveImageByQuestionId(db, modalQ.id, modalImageDataUrl, modalImageMime);
        }

        hideModal();
        await openQuiz(currentQuizId);
    } catch (e) {
        console.error(e);
        alert("Error guardando: " + (e?.message || e));
    }
});

const btnExportBackup = document.getElementById("btnExportBackup");

btnExportBackup.onclick = async () => {
    const backup = await exportBackup(db);

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "daypo_backup.json";
    a.click();

    URL.revokeObjectURL(url);
};

async function getAllFromStore(db, storeName) {
    return await new Promise((resolve, reject) => {
        const t = db.transaction(storeName, "readonly");
        const s = t.objectStore(storeName);
        const req = s.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function exportBackup(db) {
    const quizzes = await getAllFromStore(db, "quizzes");
    const questions = await getAllFromStore(db, "questions");
    const options = await getAllFromStore(db, "options");
    const images = await getAllFromStore(db, "images2");

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        quizzes,
        questions,
        options,
        images
    };
}


