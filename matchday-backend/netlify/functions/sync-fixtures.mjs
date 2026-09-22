// Runs on Netlify's schedule (see config below) and folds the latest
// UPL fixtures/results into Supabase.
//
// Scheduled functions only run on published production deploys — not on
// deploy previews or branch deploys — and have a 30s execution limit,
// which a single-request sync stays well inside.
//
// To run it by hand instead (e.g. right after a matchday), use the
// admin endpoint: POST /api/admin/sync with the x-admin-token header.
//
// syncService is CommonJS, so its module.exports arrives here as the
// default export.
import syncService from "../../src/services/syncService.js";

export default async () => {
  try {
    const summary = await syncService.syncFixtures();
    console.log("Fixture sync finished:", JSON.stringify(summary));
  } catch (err) {
    // Logged rather than rethrown so a provider outage doesn't show up
    // as a failed run; the next one will pick things up.
    console.error("Fixture sync failed:", err.message);
  }
};

export const config = {
  // 04:00 UTC daily — after evening kickoffs have finished and been
  // settled upstream, and outside any traffic peak.
  schedule: "0 4 * * *",
};
