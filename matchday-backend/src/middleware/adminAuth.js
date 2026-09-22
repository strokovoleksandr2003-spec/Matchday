// A single shared token, not a full auth system — enough to stop a
// random visitor from editing match results, not enough to hand out
// to more than one trusted editor. Swap for real accounts if more
// than a couple of people end up entering data.

function adminAuth(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    return res.status(500).json({
      error: "ADMIN_TOKEN is not set on the server — admin routes are disabled until it is.",
    });
  }

  const provided = req.get("x-admin-token");
  if (provided !== configured) {
    return res.status(401).json({ error: "Missing or invalid x-admin-token header" });
  }

  next();
}

module.exports = { adminAuth };
