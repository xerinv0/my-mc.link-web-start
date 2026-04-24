import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import MyMCLib from "mymc-lib";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const mc = new MyMCLib(process.env.MYMC_TOKEN!);

// global state (like your Discord bot)
let serverState = {
  isOnline: false,
  isRetrying: false,
  ips: {
    javaIp: null as string | null,
    geyserIp: null as string | null,
  },
  mapUrl: null as string | null,
  players: [] as string[],
  currentData: null as any,
};

// helper
function isOnline(data: any) {
  return data?.stats?.memory?.percent !== "0.00%";
}

// normalize players safely
function normalizePlayers(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (raw?.players) return raw.players;
  return [];
}

// 🔹 STATUS API (everything in one call)
app.get("/api/status", async (_, res) => {
  try {
    const [stats, playersRaw] = await Promise.all([
      mc.getStats(),
      mc.getOnlinePlayers(),
    ]);

    serverState.currentData = stats;
    serverState.players = normalizePlayers(playersRaw);
    serverState.isOnline = isOnline(stats);

    // fetch map once
    if (!serverState.mapUrl) {
      try {
        serverState.mapUrl = await mc.getServersMapUrl();
      } catch {
        serverState.mapUrl = null;
      }
    }

    res.json(serverState);
  } catch {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// 🔹 START SERVER
app.post("/api/start", async (_, res) => {
  if (serverState.isOnline || serverState.isRetrying) {
    return res.json(serverState);
  }

  try {
    serverState.isRetrying = true;

    const result = await mc.startServer();

    if (result?.success) {
      // fetch IPs only once
      if (!serverState.ips.javaIp) {
        try {
          serverState.ips.javaIp = await mc.createMyLink();
        } catch {}
      }

      if (!serverState.ips.geyserIp) {
        try {
          serverState.ips.geyserIp =
            await mc.createGeyserConnectionUrl();
        } catch {}
      }

      serverState.isOnline = true;
    }

    serverState.isRetrying = false;

    res.json(serverState);
  } catch {
    serverState.isRetrying = false;
    res.status(500).json({ error: "Failed to start server" });
  }
});

app.listen(3000, () => {
  console.log("🚀 API running on http://localhost:3000");
});
