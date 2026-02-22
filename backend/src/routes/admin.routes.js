const express = require("express");
const multer = require("multer");
const path = require("path");
const { prisma } = require("../prisma");
const { supabase } = require("../supabase");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* =========================================
   POST /admin/quizzes/import
   Body: { title, items: [{origNo,prompt,options,correct}] }
   ========================================= */
router.post("/quizzes/import", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, items } = req.body || {};
    if (!title || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "title e items son requeridos" });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title,
        questions: {
          create: items.map((it) => ({
            origNo: it.origNo ?? null,
            prompt: it.prompt,
            options: {
              create: (it.options || []).map((optText, idx) => ({
                optIndex: idx,
                text: optText,
                isCorrect: (it.correct || []).includes(idx) ? 1 : 0,
              })),
            },
          })),
        },
      },
      select: { id: true, title: true, createdAt: true },
    });

    res.json({ ok: true, quiz });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error importando quiz" });
  }
});

/* =========================================
   PUT /admin/questions/:id
   Body: { prompt, origNo, options[], correctIndex }
   ========================================= */
router.put("/questions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.id, 10);
    if (Number.isNaN(questionId)) return res.status(400).json({ error: "ID inválido" });

    const { prompt, origNo, options, correctIndex } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt requerido" });
    }
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "options debe tener al menos 2 elementos" });
    }

    const ci = parseInt(correctIndex, 10);
    if (Number.isNaN(ci) || ci < 0 || ci >= options.length) {
      return res.status(400).json({ error: "correctIndex inválido" });
    }

    // Transacción: actualizar pregunta + recrear opciones
    const updated = await prisma.$transaction(async (tx) => {
      const q = await tx.question.update({
        where: { id: questionId },
        data: {
          prompt: prompt.replace(/\r\n/g, "\n").trim(),
          origNo: (() => {
            if (origNo === null || origNo === undefined) return null;
            const s = String(origNo).trim();
            if (!s) return null;
            const n = parseInt(s, 10);
            if (Number.isNaN(n) || n <= 0) return null; // ✅ 1..N, nunca 0
            return n;
          })(),
        },
        select: { id: true, quizId: true, origNo: true, prompt: true },
      });

      // borrar opciones previas
      await tx.option.deleteMany({ where: { questionId } });

      // crear opciones nuevas
      await tx.option.createMany({
        data: options.map((t, idx) => ({
          questionId,
          optIndex: idx,
          text: String(t || "").trim(),
          isCorrect: idx === ci ? 1 : 0,
        })),
      });

      return q;
    });

    res.json({ ok: true, question: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error actualizando pregunta" });
  }
});

/* =========================================
   POST /admin/questions/:id/image
   form-data: file
   Guarda en Supabase y en QuestionImage(bucket,path,mime)
   ========================================= */
router.post(
  "/questions/:id/image",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      const questionId = parseInt(req.params.id, 10);
      if (Number.isNaN(questionId)) return res.status(400).json({ error: "ID inválido" });
      if (!req.file) return res.status(400).json({ error: "Falta archivo (file)" });

      const bucket = process.env.SUPABASE_BUCKET;
      if (!bucket) return res.status(500).json({ error: "Falta SUPABASE_BUCKET en .env" });

      // Ext segura
      const extRaw = (path.extname(req.file.originalname) || "").toLowerCase();
      const ext = [".png", ".jpg", ".jpeg", ".webp"].includes(extRaw) ? extRaw : ".png";

      // Si ya había imagen, borrar del storage
      const prev = await prisma.questionImage.findUnique({ where: { questionId } });
      if (prev?.path) {
        await supabase.storage.from(bucket).remove([prev.path]);
      }

      const storagePath = `questions/${questionId}/${Date.now()}${ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype || "application/octet-stream",
          upsert: true,
        });

      if (upErr) return res.status(500).json({ error: upErr.message });

      const img = await prisma.questionImage.upsert({
        where: { questionId },
        create: { questionId, bucket, path: storagePath, mime: req.file.mimetype || null },
        update: { bucket, path: storagePath, mime: req.file.mimetype || null },
      });

      const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;

      res.json({ ok: true, image: img, publicUrl });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error subiendo imagen" });
    }
  }
);

/* =========================================
   DELETE /admin/questions/:id/image
   ========================================= */
router.delete("/questions/:id/image", requireAuth, requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.id, 10);
    if (Number.isNaN(questionId)) return res.status(400).json({ error: "ID inválido" });

    const bucket = process.env.SUPABASE_BUCKET;
    if (!bucket) return res.status(500).json({ error: "Falta SUPABASE_BUCKET en .env" });

    const img = await prisma.questionImage.findUnique({ where: { questionId } });
    if (!img) return res.json({ ok: true });

    if (img.path) {
      await supabase.storage.from(bucket).remove([img.path]);
    }

    await prisma.questionImage.delete({ where: { questionId } });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error eliminando imagen" });
  }
});
// =========================================
// DELETE /admin/questions/:id
// Borra 1 pregunta (opciones + imagen + archivo en Supabase)
// =========================================
router.delete("/questions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.id, 10);
    if (Number.isNaN(questionId)) return res.status(400).json({ error: "ID inválido" });

    const bucket = process.env.SUPABASE_BUCKET;

    await prisma.$transaction(async (tx) => {
      // 1) buscar imagen (si existe) para borrar archivo en storage
      const img = await tx.questionImage.findUnique({ where: { questionId } });

      // 2) borrar imagen en DB (si existe)
      if (img) {
        await tx.questionImage.delete({ where: { questionId } });
      }

      // 3) borrar opciones
      await tx.option.deleteMany({ where: { questionId } });

      // 4) borrar pregunta
      await tx.question.delete({ where: { id: questionId } });

      // 5) borrar archivo en Supabase (fuera de Prisma, pero dentro de flujo)
      if (img?.path && bucket) {
        await supabase.storage.from(bucket).remove([img.path]);
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error eliminando pregunta" });
  }
});

// =========================================
// DELETE /admin/quizzes/:id
// Borra quiz completo (preguntas + opciones + imágenes + archivos en Supabase)
// =========================================
router.delete("/quizzes/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id, 10);
    if (Number.isNaN(quizId)) return res.status(400).json({ error: "ID inválido" });

    const bucket = process.env.SUPABASE_BUCKET;

    // 1) recoger paths de imágenes para borrarlas del storage
    const imgs = await prisma.questionImage.findMany({
      where: { question: { quizId } },
      select: { path: true },
    });
    const paths = imgs.map(x => x.path).filter(Boolean);

    // 2) borrar todo en transacción (DB)
    await prisma.$transaction(async (tx) => {
      // borrar imágenes (DB)
      await tx.questionImage.deleteMany({ where: { question: { quizId } } });

      // borrar opciones (DB)
      await tx.option.deleteMany({ where: { question: { quizId } } });

      // borrar preguntas (DB)
      await tx.question.deleteMany({ where: { quizId } });

      // borrar quiz
      await tx.quiz.delete({ where: { id: quizId } });
    });

    // 3) borrar archivos en Supabase (storage)
    if (bucket && paths.length) {
      // Supabase permite borrar varios paths a la vez
      await supabase.storage.from(bucket).remove(paths);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error eliminando quiz" });
  }
});

module.exports = router;