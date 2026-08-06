"use client";

import { useEffect, useRef, useState } from "react";
import { FileDrop } from "../components/FileDrop";
import { formatBytes } from "../lib/image";

type LogItem = { id: number; text: string; remote?: boolean };
type IncomingFile = { name: string; type: string; size: number; chunks: ArrayBuffer[]; received: number };
type PairRole = "host" | "guest";
type PairMode = "idle" | "hosting" | "joining";

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
  const autoJoinedRef = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState<string[]>([]);
  const [roomUrl, setRoomUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [mode, setMode] = useState<PairMode>("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Create a room or enter four emojis");
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room") ?? "";
    if (!autoJoinedRef.current && validEmojiCode(code)) {
      autoJoinedRef.current = true;
      setSelected(Array.from(code));
      connectRoom(code, "guest");
    }
    return () => {
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

  const log = (text: string, remote = false) => setLogs((items) => [...items, { id: Date.now() + Math.random(), text, remote }]);

  function makePeer() {
    peerRef.current?.close();
    negotiatingRef.current = false;
    const peer = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = peer;
    peer.addEventListener("connectionstatechange", () => {
      const state = peer.connectionState;
      setStatus(state === "connected" ? "Direct connection ready" : `Direct connection: ${state}`);
      setConnected(state === "connected");
    });
    peer.addEventListener("datachannel", (event) => prepareChannel(event.channel));
    return peer;
  }

  function prepareChannel(channel: RTCDataChannel) {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      setConnected(true);
      setStatus("Direct connection ready");
      log("Connected. You can now send text or files.");
    });
    channel.addEventListener("close", () => { setConnected(false); setStatus("Direct connection closed"); });
    channel.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const payload = JSON.parse(event.data) as { kind: string; text?: string; name?: string; type?: string; size?: number };
        if (payload.kind === "text") log(payload.text ?? "", true);
        if (payload.kind === "file-start" && payload.name && typeof payload.size === "number") {
          incomingRef.current = { name: payload.name, type: payload.type || "application/octet-stream", size: payload.size, chunks: [], received: 0 };
          log(`Receiving ${payload.name} (${formatBytes(payload.size)})…`, true);
        }
        if (payload.kind === "file-end" && incomingRef.current) {
          const incoming = incomingRef.current;
          const blob = new Blob(incoming.chunks, { type: incoming.type });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = incoming.name;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          log(`Downloaded ${incoming.name} (${formatBytes(incoming.received)})`, true);
          incomingRef.current = null;
        }
      } else if (event.data instanceof ArrayBuffer && incomingRef.current) {
        incomingRef.current.chunks.push(event.data);
        incomingRef.current.received += event.data.byteLength;
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
    await waitForIce(peer);
    if (peer.localDescription) signal(peer.localDescription);
  }

  async function receiveSignal(payload: RTCSessionDescriptionInit) {
    if (payload.type === "offer" && roleRef.current === "guest") {
      const peer = makePeer();
      await peer.setRemoteDescription(payload);
      await peer.setLocalDescription(await peer.createAnswer());
      setStatus("Connecting directly…");
      await waitForIce(peer);
      if (peer.localDescription) signal(peer.localDescription);
    } else if (payload.type === "answer" && roleRef.current === "host" && peerRef.current) {
      await peerRef.current.setRemoteDescription(payload);
      setStatus("Connecting directly…");
    }
  }

  function connectRoom(code: string, role: PairRole) {
    socketRef.current?.close();
    peerRef.current?.close();
    roleRef.current = role;
    setConnected(false);
    setMode(role === "host" ? "hosting" : "joining");
    setStatus(role === "host" ? "Room created — waiting for the other device" : "Joining emoji room…");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/toolbox/api/pair/${encodeURIComponent(code)}?role=${role}`);
    socketRef.current = socket;
    socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(event.data) as { type: string; payload?: RTCSessionDescriptionInit; message?: string };
        if (packet.type === "peer-ready") {
          setStatus("Device found — creating a direct connection…");
          if (role === "host") void beginOffer();
        }
        if (packet.type === "signal" && packet.payload) void receiveSignal(packet.payload);
        if (packet.type === "peer-left" && channelRef.current?.readyState !== "open") setStatus("The other device left the pairing room");
        if (packet.type === "expired" && channelRef.current?.readyState !== "open") setStatus("Pairing room expired — create a new one");
        if (packet.type === "error") {
          setStatus(packet.message ?? "This pairing room is unavailable");
          if (role === "host") setMode("idle");
        }
      } catch {
        setStatus("Pairing message could not be read");
      }
    });
    socket.addEventListener("error", () => setStatus("Could not reach the pairing service"));
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
    socketRef.current?.close();
    peerRef.current?.close();
    socketRef.current = null;
    peerRef.current = null;
    channelRef.current = null;
    roleRef.current = null;
    negotiatingRef.current = false;
    setMode("idle");
    setConnected(false);
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
    if (!channel || channel.readyState !== "open" || !file) return;
    channel.send(JSON.stringify({ kind: "file-start", name: file.name, type: file.type, size: file.size }));
    const buffer = await file.arrayBuffer();
    const chunkSize = 16 * 1024;
    for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
      while (channel.bufferedAmount > 1024 * 1024) await new Promise((resolve) => setTimeout(resolve, 20));
      channel.send(buffer.slice(offset, Math.min(offset + chunkSize, buffer.byteLength)));
    }
    channel.send(JSON.stringify({ kind: "file-end" }));
    log(`Sent ${file.name} (${formatBytes(file.size)})`);
  }

  return <section className="tool-workspace transfer-layout">
    <div className="connection-panel">
      <div className="panel-title"><span>Pair devices</span><span>{connected ? "CONNECTED" : mode === "idle" ? "4 EMOJIS" : "PAIRING"}</span></div>
      <p className="privacy-note"><span>●</span> The temporary room relays connection details only. Files travel directly between browsers and are never stored by Kevin6.</p>
      <div className="status-box good">{status}</div>

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
      <div className="step"><span className="step-number">FILE</span><div><FileDrop onFile={setFile} label="Choose any file" accept="" /><p className="field-label">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a file after connecting"}</p><button className="button primary" disabled={!connected || !file} onClick={sendFile}>Send file</button></div></div>
      <div className="panel-title"><span>Activity</span><span>{logs.length}</span></div>
      <div className="message-log">{logs.length ? logs.map((item) => <div className={`message ${item.remote ? "remote" : ""}`} key={item.id}>{item.text}</div>) : <div className="empty-state"><strong>No activity yet</strong><span>Pair another device to start</span></div>}</div>
    </div>
  </section>;
}
