require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const publicRoutes = require("./routes/public.routes");

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://*.netlify.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "25mb" })); // imágenes base64 pueden ser pesadas
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.get("/", (req, res) => res.json({ ok: true, name: "COBAS50 API" }));

app.use("/auth", authRoutes);
app.use("/public", publicRoutes);
app.use("/admin", adminRoutes);

const port = parseInt(process.env.PORT || "4000", 10);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
