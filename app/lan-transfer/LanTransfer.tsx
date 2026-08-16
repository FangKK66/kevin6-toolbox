"use client";

import { useEffect, useRef, useState } from "react";
import { FileDrop } from "../components/FileDrop";
import { formatBytes } from "../lib/image";

type TransferStatus = "active" | "complete" | "error";
type LogItem = { id: number; text: string; remote?: boolean; progress?: number; transferStatus?: TransferStatus };
type IncomingFile = { id: string; logId: number; name: string; type: string; size: number; chunks: ArrayBuffer[]; received: number; lastProgress: number };
type OutgoingFile = { logId: number; name: string; size: number };
type PairRole = "host" | "guest";
type PairMode = "idle" | "hosting" | "joining";
type ConnectionError = {
  title: string;
  detail: string;
  code: string;
  stage: "Pairing service" | "Direct device connection";
};

const DIRECT_CONNECTION_TIMEOUT_MS = 15_000;
const DISCONNECTED_GRACE_MS = 6_000;

const EMOJIS = Array.from("🐼🦊🐸🐙🦄🐝🦋🌵🍋🍉🍒🥨🍕🚀🚲🎸🎧🎲⚽🌈⭐🔥💎🎈");

function waitForIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", change);
      resolve();
    };
    const change = () => { if (peer.iceGatheringState === "complete") finish(); };
    const timer = window.setTimeout(finish, 3500);
    peer.addEventListener("icegatheringstatechange", change);
  });
}

function randomEmojiCode() {
  const values = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(values, (value) => EMOJIS[value % EMOJIS.length]);
}

function validEmojiCode(value: string) {
  const symbols = Array.from(value);
  return symbols.length === 4 && symbols.every((symbol) => EMOJIS.includes(symbol));
}

export function LanTransfer() {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<PairRole | null>(null);
  const negotiatingRef = useRef(false);
  const incomingRef = useRef<IncomingFile | null>(null);
  const outgoingRef = useRef(new Map<string, OutgoingFile>());
  const autoJoinedRef = useRef(false);
  const directTimeoutRef = useRef<number | null>(null);
  const disconnectedTimeoutRef = useRef<number | null>(null);
  const connectionErrorRef = useRef<ConnectionError | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState<string[]>([]);
  const [roomUrl, setRoomUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [mode, setMode] = useState<PairMode>("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("Create a room or enter four emojis");
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room") ?? "";
    if (!autoJoinedRef.current && validEmojiCode(code)) {
      autoJoinedRef.current = true;
      setSelected(Array.from(code));
      connectRoom(code, "guest");
    }
    return () => {
      clearConnectionTimers();
      socketRef.current?.close();
      peerRef.current?.close();
    };
  // Initial URL pairing should run only once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!roomUrl) return;
    let active = true;
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(roomUrl, {
      width: 240,
      margin: 1,
      color: { dark: "#11120f", light: "#f0eee5" },
    })).then((url) => { if (active) setQrUrl(url); });
    return () => { active = false; };
  }, [roomUrl]);

  function log(text: string, remote = false) {
    const id = Date.now() + Math.random();
    setLogs((items) => [...items, { id, text, remote }]);
    return id;
  }

  function logTransfer(text: string, remote: boolean) {
    const id = Date.now() + Math.random();
    setLogs((items) => [...items, { id, text, remote, progress: 0, transferStatus: "active" }]);
    return id;
  }

  function updateLog(id: number, changes: Partial<LogItem>) {
    setLogs((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  function failOutgoingTransfers(reason: string) {
    for (const transfer of outgoingRef.current.values()) {
      updateLog(transfer.logId, { text: `${reason} ${transfer.name}`, transferStatus: "error" });
    }
    outgoingRef.current.clear();
    setSending(false);
  }

  function clearConnectionTimers() {
    if (directTimeoutRef.current !== null) window.clearTimeout(directTimeoutRef.current);
    if (disconnectedTimeoutRef.current !== null) window.clearTimeout(disconnectedTimeoutRef.current);
    directTimeoutRef.current = null;
    disconnectedTimeoutRef.current = null;
  }

  function reportConnectionError(error: ConnectionError) {
    clearConnectionTimers();
    setConnected(false);
    connectionErrorRef.current = error;
    setConnectionError(error);
    setStatus(error.title);
  }

  function watchDirectConnection() {
    if (directTimeoutRef.current !== null) window.clearTimeout(directTimeoutRef.current);
    directTimeoutRef.current = window.setTimeout(() => {
      if (channelRef.current?.readyState === "open") return;
      const iceState = peerRef.current?.iceConnectionState ?? "unknown";
      reportConnectionError({
        title: "The devices could not connect directly",
        detail: "The pairing service found both devices, but this network did not allow a peer-to-peer path. Public Wi-Fi client isolation, a firewall, or blocked UDP traffic is the most likely cause. Try a personal hotspot or a trusted private Wi-Fi network.",
        code: `DIRECT_CONNECTION_TIMEOUT (ICE: ${iceState})`,
        stage: "Direct device connection",
      });
    }, DIRECT_CONNECTION_TIMEOUT_MS);
  }

  function makePeer() {
    peerRef.current?.close();
    negotiatingRef.current = false;
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }],
    });
    peerRef.current = peer;
    peer.addEventListener("connectionstatechange", () => {
      const state = peer.connectionState;
      if (state === "connected") {
        clearConnectionTimers();
        connectionErrorRef.current = null;
        setConnectionError(null);
        setStatus("Direct connection ready");
        setConnected(true);
      } else if (state === "failed") {
        reportConnectionError({
          title: "The network blocked the direct connection",
          detail: "The room and pairing service worked, but WebRTC could not establish a path between the devices. This commonly happens when public Wi-Fi isolates connected devices. Try a personal hotspot or a trusted private Wi-Fi network.",
          code: `ICE_CONNECTION_FAILED (ICE: ${peer.iceConnectionState})`,
          stage: "Direct device connection",
        });
      } else if (state === "disconnected") {
        setConnected(false);
        setStatus("Direct connection interrupted — trying to recover…");
        if (disconnectedTimeoutRef.current !== null) window.clearTimeout(disconnectedTimeoutRef.current);
        disconnectedTimeoutRef.current = window.setTimeout(() => {
          if (peer.connectionState !== "connected") reportConnectionError({
            title: "The direct connection was lost",
            detail: "The devices were connected, but the network path stopped responding. Check that both devices are still on the same network, then pair them again.",
            code: `CONNECTION_LOST (ICE: ${peer.iceConnectionState})`,
            stage: "Direct device connection",
          });
        }, DISCONNECTED_GRACE_MS);
      } else if (state !== "closed") {
        setStatus(`Direct connection: ${state}`);
        setConnected(false);
      }
    });
    peer.addEventListener("datachannel", (event) => prepareChannel(event.channel));
    return peer;
  }

  function prepareChannel(channel: RTCDataChannel) {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      clearConnectionTimers();
      connectionErrorRef.current = null;
      setConnectionError(null);
      setConnected(true);
      setStatus("Direct connection ready");
      log("Connected. You can now send text or files.");
    });
    channel.addEventListener("close", () => {
      if (!roleRef.current) return;
      setConnected(false);
      failOutgoingTransfers("Transfer interrupted while sending");
      if (!connectionErrorRef.current) setStatus("Direct connection closed");
    });
    channel.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const payload = JSON.parse(event.data) as { kind: string; id?: string; text?: string; name?: string; type?: string; size?: number };
        if (payload.kind === "text") log(payload.text ?? "", true);
        if (payload.kind === "file-start" && payload.id && payload.name && typeof payload.size === "number") {
          const logId = logTransfer(`Receiving ${payload.name} (${formatBytes(payload.size)})`, true);
          incomingRef.current = { id: payload.id, logId, name: payload.name, type: payload.type || "application/octet-stream", size: payload.size, chunks: [], received: 0, lastProgress: 0 };
        }
        if (payload.kind === "file-end" && incomingRef.current && payload.id === incomingRef.current.id) {
          const incoming = incomingRef.current;
          if (incoming.received !== incoming.size) {
            const progress = incoming.size ? Math.min(99, Math.floor((incoming.received / incoming.size) * 100)) : 0;
            updateLog(incoming.logId, { text: `Could not receive ${incoming.name} — file was incomplete`, progress, transferStatus: "error" });
            channel.send(JSON.stringify({ kind: "file-failed", id: incoming.id }));
            incomingRef.current = null;
            return;
          }
          const blob = new Blob(incoming.chunks, { type: incoming.type });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = incoming.name;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          updateLog(incoming.logId, { text: `Downloaded ${incoming.name} (${formatBytes(incoming.received)})`, progress: 100, transferStatus: "complete" });
          channel.send(JSON.stringify({ kind: "file-received", id: incoming.id }));
          incomingRef.current = null;
        }
        if ((payload.kind === "file-received" || payload.kind === "file-failed") && payload.id) {
          const outgoing = outgoingRef.current.get(payload.id);
          if (outgoing) {
            updateLog(outgoing.logId, payload.kind === "file-received"
              ? { text: `Sent ${outgoing.name} (${formatBytes(outgoing.size)})`, progress: 100, transferStatus: "complete" }
              : { text: `The other device could not receive ${outgoing.name}`, transferStatus: "error" });
            outgoingRef.current.delete(payload.id);
            setSending(false);
          }
        }
      } else if (event.data instanceof ArrayBuffer && incomingRef.current) {
        incomingRef.current.chunks.push(event.data);
        incomingRef.current.received += event.data.byteLength;
        const incoming = incomingRef.current;
        const progress = incoming.size ? Math.min(99, Math.floor((incoming.received / incoming.size) * 100)) : 99;
        if (progress > incoming.lastProgress) {
          incoming.lastProgress = progress;
          updateLog(incoming.logId, { progress });
        }
      }
    });
  }

  function signal(payload: RTCSessionDescriptionInit) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "signal", payload }));
    }
  }

  async function beginOffer() {
    if (negotiatingRef.current) return;
    negotiatingRef.current = true;
    const peer = makePeer();
    negotiatingRef.current = true;
    const channel = peer.createDataChannel("kevin6-transfer", { ordered: true });
    prepareChannel(channel);
    await peer.setLocalDescription(await peer.createOffer());
    setStatus("Connecting directly…");
    watchDirectConnection();
    await waitForIce(peer);
    if (peer.localDescription) signal(peer.localDescription);
  }

  async function receiveSignal(payload: RTCSessionDescriptionInit) {
    if (payload.type === "offer" && roleRef.current === "guest") {
      const peer = makePeer();
      await peer.setRemoteDescription(payload);
      await peer.setLocalDescription(await peer.createAnswer());
      setStatus("Connecting directly…");
      watchDirectConnection();
      await waitForIce(peer);
      if (peer.localDescription) signal(peer.localDescription);
    } else if (payload.type === "answer" && roleRef.current === "host" && peerRef.current) {
      await peerRef.current.setRemoteDescription(payload);
      setStatus("Connecting directly…");
    }
  }

  function connectRoom(code: string, role: PairRole) {
    clearConnectionTimers();
    socketRef.current?.close();
    peerRef.current?.close();
    roleRef.current = role;
    setConnected(false);
    connectionErrorRef.current = null;
    setConnectionError(null);
    setMode(role === "host" ? "hosting" : "joining");
    setStatus(role === "host" ? "Room created — waiting for the other device" : "Joining emoji room…");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/toolbox/api/pair/${encodeURIComponent(code)}?role=${role}`);
    socketRef.current = socket;
    socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(event.data) as { type: string; payload?: RTCSessionDescriptionInit; message?: string };
        if (packet.type === "peer-ready") {
          connectionErrorRef.current = null;
          setConnectionError(null);
          setStatus("Device found — creating a direct connection…");
          if (role === "host") void beginOffer().catch(() => reportConnectionError({
            title: "Could not start the direct connection",
            detail: "The browser could not create a WebRTC connection. Check browser permissions or restrictions, then create a new room.",
            code: "WEBRTC_NEGOTIATION_FAILED",
            stage: "Direct device connection",
          }));
        }
        if (packet.type === "signal" && packet.payload) void receiveSignal(packet.payload).catch(() => reportConnectionError({
          title: "Could not negotiate the direct connection",
          detail: "The devices found each other, but the browser could not process the connection details. Create a new room and try again, or use another browser.",
          code: "WEBRTC_SIGNAL_NEGOTIATION_FAILED",
          stage: "Direct device connection",
        }));
        if (packet.type === "peer-left" && channelRef.current?.readyState !== "open") reportConnectionError({
          title: "The other device left before connecting",
          detail: peerRef.current
            ? "The pairing service worked, but the direct device connection never opened before the other device left. If it was stuck on connecting, this Wi-Fi may be isolating devices; try a personal hotspot or private Wi-Fi."
            : "The other device closed the room before the direct connection started. Ask them to keep the page open and pair again.",
          code: peerRef.current ? "PEER_LEFT_DURING_DIRECT_CONNECT" : "PEER_LEFT_DURING_PAIRING",
          stage: peerRef.current ? "Direct device connection" : "Pairing service",
        });
        if (packet.type === "expired" && channelRef.current?.readyState !== "open") reportConnectionError({
          title: "The pairing room expired",
          detail: "The devices did not finish pairing within five minutes. Create a new room and keep both pages open while connecting.",
          code: "PAIRING_ROOM_EXPIRED",
          stage: "Pairing service",
        });
        if (packet.type === "error") {
          reportConnectionError({
            title: packet.message ?? "This pairing room is unavailable",
            detail: "The pairing service rejected this room. Create a new emoji room and try again.",
            code: "PAIRING_SERVICE_REJECTED",
            stage: "Pairing service",
          });
          if (role === "host") setMode("idle");
        }
      } catch {
        reportConnectionError({ title: "A pairing message could not be read", detail: "The pairing service returned an invalid response. Create a new room and try again.", code: "INVALID_SIGNALING_MESSAGE", stage: "Pairing service" });
      }
    });
    socket.addEventListener("error", () => reportConnectionError({
      title: "Could not reach the pairing service",
      detail: "The site could not exchange connection details. Check internet access, a VPN, content blocker, or network firewall, then try again.",
      code: "SIGNALING_SERVICE_UNREACHABLE",
      stage: "Pairing service",
    }));
    socket.addEventListener("close", () => {
      if (channelRef.current?.readyState !== "open" && peerRef.current?.connectionState !== "connected") {
        setConnected(false);
      }
    });
  }

  function createRoom() {
    const symbols = randomEmojiCode();
    const code = symbols.join("");
    const url = `${window.location.origin}/toolbox/lan-transfer/?room=${encodeURIComponent(code)}`;
    setRoomCode(symbols);
    setRoomUrl(url);
    connectRoom(code, "host");
  }

  function joinRoom() {
    if (selected.length !== 4) return;
    const code = selected.join("");
    window.history.replaceState(null, "", `/toolbox/lan-transfer/?room=${encodeURIComponent(code)}`);
    connectRoom(code, "guest");
  }

  function resetPairing() {
    clearConnectionTimers();
    socketRef.current?.close();
    peerRef.current?.close();
    socketRef.current = null;
    peerRef.current = null;
    channelRef.current = null;
    roleRef.current = null;
    negotiatingRef.current = false;
    setMode("idle");
    setConnected(false);
    failOutgoingTransfers("Transfer cancelled while sending");
    connectionErrorRef.current = null;
    setConnectionError(null);
    setRoomCode([]);
    setRoomUrl("");
    setQrUrl("");
    setSelected([]);
    setStatus("Create a room or enter four emojis");
    window.history.replaceState(null, "", "/toolbox/lan-transfer/");
  }

  function sendText() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open" || !message.trim()) return;
    channel.send(JSON.stringify({ kind: "text", text: message }));
    log(message);
    setMessage("");
  }

  async function sendFile() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open" || !file || sending) return;
    const selectedFile = file;
    const transferId = crypto.randomUUID();
    const logId = logTransfer(`Sending ${selectedFile.name} (${formatBytes(selectedFile.size)})`, false);
    outgoingRef.current.set(transferId, { logId, name: selectedFile.name, size: selectedFile.size });
    setSending(true);
    try {
      channel.send(JSON.stringify({ kind: "file-start", id: transferId, name: selectedFile.name, type: selectedFile.type, size: selectedFile.size }));
      const buffer = await selectedFile.arrayBuffer();
      const chunkSize = 16 * 1024;
      let lastProgress = 0;
      for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
        while (channel.bufferedAmount > 1024 * 1024) await new Promise((resolve) => setTimeout(resolve, 20));
        if (channel.readyState !== "open") throw new Error("Data channel closed");
        const end = Math.min(offset + chunkSize, buffer.byteLength);
        channel.send(buffer.slice(offset, end));
        const progress = buffer.byteLength ? Math.min(99, Math.floor((end / buffer.byteLength) * 100)) : 99;
        if (progress > lastProgress) {
          lastProgress = progress;
          updateLog(logId, { progress });
        }
      }
      channel.send(JSON.stringify({ kind: "file-end", id: transferId }));
      updateLog(logId, { text: `Sent ${selectedFile.name} — waiting for the other device`, progress: 99 });
    } catch {
      outgoingRef.current.delete(transferId);
      updateLog(logId, { text: `Could not send ${selectedFile.name}`, transferStatus: "error" });
      setSending(false);
    }
  }

  return <section className="tool-workspace transfer-layout">
    <div className="connection-panel">
      <div className="panel-title"><span>Pair devices</span><span>{connected ? "CONNECTED" : mode === "idle" ? "4 EMOJIS" : "PAIRING"}</span></div>
      <p className="privacy-note"><span>●</span> The temporary room relays connection details only. Files travel directly between browsers and are never stored by Kevin6.</p>
      <div className={`status-box ${connectionError ? "error" : "good"}`} role={connectionError ? "alert" : "status"}>{status}</div>
      {connectionError && <div className="connection-error" role="alert">
        <strong>What went wrong</strong>
        <p>{connectionError.detail}</p>
        <div className="connection-diagnostic"><span>Failed at: {connectionError.stage}</span><code>{connectionError.code}</code></div>
      </div>}

      {mode === "idle" && <>
        <div className="step"><span className="step-number">A</span><div><p className="field-label">On the first device</p><button className="button primary" onClick={createRoom}>Create an emoji room</button></div></div>
        <div className="pair-divider"><span>OR JOIN A ROOM</span></div>
        <div className="emoji-code" aria-label="Selected emoji code">{[0, 1, 2, 3].map((index) => <span key={index}>{selected[index] ?? "·"}</span>)}</div>
        <div className="emoji-picker" aria-label="Emoji pairing code picker">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => setSelected((items) => items.length < 4 ? [...items, emoji] : items)} aria-label={`Choose ${emoji}`}>{emoji}</button>)}</div>
        <div className="button-row pair-actions"><button className="button" disabled={!selected.length} onClick={() => setSelected((items) => items.slice(0, -1))}>Delete</button><button className="button" disabled={!selected.length} onClick={() => setSelected([])}>Clear</button><button className="button primary" disabled={selected.length !== 4} onClick={joinRoom}>Join room</button></div>
      </>}

      {mode === "hosting" && <div className="room-card">
        <p className="field-label">On the other device, scan the QR code or enter these four emojis</p>
        <div className="emoji-code room-code">{roomCode.map((emoji, index) => <span key={`${emoji}-${index}`}>{emoji}</span>)}</div>
        {qrUrl && <img className="pair-qr" src={qrUrl} alt="QR code for this temporary pairing room" />}
        <p className="field-label">This room expires after five minutes.</p>
      </div>}

      {mode === "joining" && <div className="room-card"><p className="field-label">Joining room</p><div className="emoji-code room-code">{selected.map((emoji, index) => <span key={`${emoji}-${index}`}>{emoji}</span>)}</div></div>}
      {mode !== "idle" && !connected && <button className="button pair-reset" onClick={resetPairing}>Cancel pairing</button>}
      {connected && <button className="button pair-reset" onClick={resetPairing}>Disconnect</button>}
    </div>

    <div className="connection-panel">
      <div className="panel-title"><span>Send directly</span><span>END-TO-END ENCRYPTED</span></div>
      <div className="field"><label>Text</label><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type or paste a message" /><button className="button primary" disabled={!connected || !message.trim()} onClick={sendText}>Send text</button></div>
      <div className="step"><span className="step-number">FILE</span><div><FileDrop onFile={setFile} label="Choose any file" accept="" /><p className="field-label">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a file after connecting"}</p><button className="button primary" disabled={!connected || !file || sending} onClick={sendFile}>{sending ? "Sending file…" : "Send file"}</button></div></div>
      <div className="panel-title"><span>Activity</span><span>{logs.length}</span></div>
      <div className="message-log">{logs.length ? logs.map((item) => <div className={`message ${item.remote ? "remote" : ""} ${item.transferStatus ? `transfer ${item.transferStatus}` : ""}`} key={item.id}>
        <div className="message-text">{item.text}{typeof item.progress === "number" && <span>{item.progress}%</span>}</div>
        {typeof item.progress === "number" && <div className="transfer-progress" role="progressbar" aria-label={item.text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}><span style={{ width: `${item.progress}%` }} /></div>}
      </div>) : <div className="empty-state"><strong>No activity yet</strong><span>Pair another device to start</span></div>}</div>
    </div>
  </section>;
}
