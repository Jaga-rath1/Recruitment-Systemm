require("dotenv").config();
const app = require("./app");
const { PORT } = require("./config/env");

app.listen(PORT, () => {
  console.log(`[api-gateway] Running on port ${PORT}`);
});
