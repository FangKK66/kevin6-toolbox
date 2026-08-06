/** Cloudflare Worker entry point for Kevin6 Toolbox. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  PAIR_ROOMS: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type DurableObjectId = object;
interface DurableObjectStub { fetch(request: Request): Promise<Response>; }
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAll(): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}
declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };

type PairRole = "host" | "guest";
type SignalMessage = { type: "signal"; payload: unknown };

function sendJson(socket: WebSocket, payload: object) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

/** Five-minute, signaling-only room. File bytes never pass through this object. */
export class PairRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const role = new URL(request.url).searchParams.get("role") as PairRole | null;
    if (role !== "host" && role !== "guest") return new Response("Invalid pairing role", { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, [role]);

    if (this.state.getWebSockets(role).length > 1) {
      sendJson(server, { type: "error", message: role === "host" ? "That emoji room is already in use." : "This room already has two devices." });
      server.close(1008, "Pairing role occupied");
    } else {
      await this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
      sendJson(server, { type: "ready", role });
      const host = this.state.getWebSockets("host")[0];
      const guest = this.state.getWebSockets("guest")[0];
      if (host && guest) {
        sendJson(host, { type: "peer-ready" });
        sendJson(guest, { type: "peer-ready" });
      }
    }

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 100_000) return;
    try {
      const payload = JSON.parse(message) as SignalMessage;
      if (payload.type !== "signal") return;
      const isHost = this.state.getWebSockets("host").includes(socket);
      const targets = this.state.getWebSockets(isHost ? "guest" : "host");
      for (const target of targets) sendJson(target, payload);
    } catch {
      sendJson(socket, { type: "error", message: "Invalid signaling message." });
    }
  }

  webSocketClose(socket: WebSocket) {
    for (const peer of this.state.getWebSockets()) {
      if (peer !== socket) sendJson(peer, { type: "peer-left" });
    }
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Pairing connection error");
  }

  async alarm() {
    for (const socket of this.state.getWebSockets()) {
      sendJson(socket, { type: "expired" });
      socket.close(1000, "Pairing room expired");
    }
    await this.state.storage.deleteAll();
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/toolbox") {
      url.pathname = "/toolbox/";
      return Response.redirect(url, 308);
    }

    const pairRoute = url.pathname.match(/^\/toolbox\/api\/pair\/([^/]+)$/);
    if (pairRoute) {
      const code = decodeURIComponent(pairRoute[1]);
      if (Array.from(code).length !== 4 || code.length > 32) return new Response("Invalid pairing code", { status: 400 });
      const id = env.PAIR_ROOMS.idFromName(code);
      return env.PAIR_ROOMS.get(id).fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
