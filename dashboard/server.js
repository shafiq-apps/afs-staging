import dotenv from "dotenv";
dotenv.config({ path: ".env" });

console.log("env", process.env);

import("./build/server/index.js").catch(err => {
  console.error("Dashboard failed:", err);
  process.exit(1);
});