import dotenv from "dotenv";
dotenv.config({ path: "./.env", debug: true });

async function start() {
  try {
    const build = await import("./build/server/index.js"); // dynamic import
    const express = await import("express");
    const { createRequestHandler } = await import("@remix-run/express");

    const app = express.default(); // because dynamic import
    app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

    const port = process.env.PORT || 3556;
    app.listen(port, () => console.log(`Remix server running on ${port}`));
  } catch (err) {
    console.error("Dashboard failed:", err);
    process.exit(1);
  }
}

start();
