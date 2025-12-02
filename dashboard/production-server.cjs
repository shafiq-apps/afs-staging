// Loads Shopify env first
require("dotenv").config({ path: __dirname + "/.env" });

// Then load Remix ESM server
import("./build/server/index.js")
  .catch(err => {
    console.error("Dashboard failed:", err);
    process.exit(1);
  });
