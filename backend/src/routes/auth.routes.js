// src/routes/auth.routes.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Crear usuario (para crear admin al inicio)
router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email y password son requeridos" });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "Email ya existe" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role === "user" ? "user" : "admin",
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error registrando" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email y password son requeridos" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error login" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = router;