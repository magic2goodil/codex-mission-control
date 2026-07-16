import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addComment, addProject, addTask, generatePrompt, readState, taskWithProject, updateTask } from "./store.js";
import { loadConfig } from "./config.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4317);
const PUBLIC_DIR = path.join(process.cwd(), "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large.");
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    const state = await readState();
    const config = await loadConfig();
    sendJson(res, 200, { ...state, configLoaded: !!config });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    const config = await loadConfig();
    sendJson(res, 200, { configLoaded: !!config, config });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    sendJson(res, 201, { project: await addProject(await readJsonBody(req)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    sendJson(res, 201, { task: await addTask(await readJsonBody(req)) });
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === "PATCH") {
    sendJson(res, 200, { task: await updateTask(taskMatch[1], await readJsonBody(req)) });
    return;
  }

  const commentMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
  if (commentMatch && req.method === "POST") {
    const body = await readJsonBody(req);
    sendJson(res, 201, { comment: await addComment(commentMatch[1], body.body, body.author) });
    return;
  }

  const promptMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/prompt$/);
  if (promptMatch && req.method === "GET") {
    const state = await readState();
    const prompt = generatePrompt(state, promptMatch[1], url.searchParams.get("role") || "builder");
    sendJson(res, 200, { prompt });
    return;
  }

  const detailMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/detail$/);
  if (detailMatch && req.method === "GET") {
    const state = await readState();
    const task = state.tasks.find((item) => item.id === detailMatch[1]);
    if (!task) {
      sendJson(res, 404, { error: "Task not found." });
      return;
    }
    sendJson(res, 200, { task: taskWithProject(state, task) });
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Codex Mission Control running at http://${HOST}:${PORT}`);
});

