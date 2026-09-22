// Netlify runs this as a Lambda function. It's the same Express app
// used for local dev (src/app.js) — nothing about the routes changes,
// serverless-http just adapts Lambda's event/response shape to what
// Express expects.

const serverless = require("serverless-http");
const { createApp } = require("../../src/app");

const app = createApp();

exports.handler = serverless(app);
