import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import cron from "node-cron";
import { config } from "dotenv";

import { syncChannels } from "./services/channelCrawler.js";
import { streamAudio } from "./controllers/streamAudio.js";
import { AppError } from "./utils/AppError.js";

config();

const app = express();
const PORT = process.env.PORT || 7860;
const CHANNELS = [
  "-1001140281557",
  // "-1001079635237"
];

// app.get("/health", (req, res) => {
//   res
//     .status(200)
//     .json({ status: "alive", message: "The Martyrs API is active" });
// });

// 2. Daily Sync Cron (3:00 AM)
cron.schedule(
  "0 3 * * *",
  async () => {
    console.log("⏰ 3:00 AM: Daily Sync Triggered");
    try {
      await syncChannels(CHANNELS);
    } catch (error: any) {
      console.error("❌ Sync Failed:", error);
      throw new AppError(`An error occured: ${error.mesage || error}`);
    }
  },
  { timezone: "Africa/Accra" },
);

// 3. Global Middleware
app.use(cookieParser());

const corsOptions = {
  origin: ["http://localhost:7860", "http://localhost:8080"],
  credentials: true,
  exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// app.use(express.json());

/**
 * 🚀 High-Latency Fix: Ensure 'authenticateRequest' attaches the
 * full User object (including sessionString) to req.user so
 * streamAudio doesn't have to query the DB again.
 */
app.get("/stream/:channelId/:messageId", streamAudio);

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
🚀 Server Ready!
📡 Port: ${PORT}
🌍 Binding: 0.0.0.0
🔊 Streaming endpoint: /stream/:channelId/:messageId
  `);
});
