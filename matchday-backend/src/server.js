require("dotenv").config();
const { createApp } = require("./app");

const app = createApp();
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Matchday API listening on :${port}`);
});
