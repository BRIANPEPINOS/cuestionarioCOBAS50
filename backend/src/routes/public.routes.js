// src/routes/public.routes.js
const express = require("express");
const { prisma } = require("../prisma");
const { supabase } = require("../supabase");

const router = express.Router();

// Lista de quizzes
router.get("/quizzes", async (req, res) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    });
    res.json({ quizzes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error listando quizzes" });
  }
});

// Quiz completo por id (con imageUrl)
router.get("/quizzes/:id", async (req, res) => {
  try {
    const quizId = parseInt(req.params.id, 10);
    if (Number.isNaN(quizId)) return res.status(400).json({ error: "ID inválido" });

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: [{ origNo: "asc" }, { id: "asc" }],
          include: {
            options: { orderBy: { optIndex: "asc" } },
            image: true
          }
        },
      },
    });

    if (!quiz) return res.status(404).json({ error: "Quiz no encontrado" });

    const questions = quiz.questions.map((q) => {
      let imageUrl = "";
      if (q.image?.bucket && q.image?.path) {
        imageUrl = supabase.storage.from(q.image.bucket).getPublicUrl(q.image.path).data.publicUrl || "";
      }

      return {
        id: q.id,
        origNo: q.origNo,
        prompt: q.prompt,
        options: q.options.map((o) => ({ i: o.optIndex, t: o.text })),
        correct: q.options.filter(o => o.isCorrect === 1).map(o => o.optIndex), // útil para admin
        imageUrl,
      };
    });

    res.json({ id: quiz.id, title: quiz.title, questions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error cargando quiz" });
  }
});

module.exports = router;