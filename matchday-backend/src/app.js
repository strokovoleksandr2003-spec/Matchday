const express = require("express");
const path = require("path");
const cors = require("cors");
const leagueRoutes = require("./routes/league");
const adminRoutes = require("./routes/admin");

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ ok: true }));
  app.use("/api/leagues", leagueRoutes);
  app.use("/api/admin", adminRoutes);

  // the admin form — open /admin.html, paste in the token, enter results
  app.use(express.static(path.join(__dirname, "..", "public")));

  return app;
}

module.exports = { createApp };
