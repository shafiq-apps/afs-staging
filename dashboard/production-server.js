import dotenv from "dotenv";
dotenv.config({ path: ".env" });

// Debug check
console.log("Loaded ENV:", process.env);

import("./build/server/index.js").catch(err => {
  console.error("Dashboard failed:", err);
  process.exit(1);
});
