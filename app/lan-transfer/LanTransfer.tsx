"use client";

import { useEffect, useRef, useState } from "react";
import { FileDrop } from "../components/FileDrop";
import { formatBytes } from "../lib/image";

type LogItem = { id: number; text: string; remote?: boolean };
type IncomingFile = { name: string; type: string; size: number; chunks: ArrayBuffer[]; received: number };

function waitForIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const change = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", change);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", change);
  });
}

export function LanTransfer() {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const incomingRef = useRef<IncomingFile | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Not connected");
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);

  useEffect(() => () => peerRef.current?.close(), []);
  const log = (text: string, remote = false) => setLogs((items) => [...items, { id: Date.now() + Math.random(), text, remote }]);

  function makePeer() {
    peerRef.current?.close();
    const peer = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = peer;
    peer.addEventListener("connectionstatechange", () => {
      const state = peer.connectionState;
      setStatus(state === "connected" ? "Direct connection ready" : state);
      setConnected(state === "connected");
    });
    peer.addEventListener("datachannel", (event) => prepareChannel(event.channel));
    return peer;
  }

  function prepareChannel(channel: RTCDataChannel) {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => { setConnected(true); setStatus("Direct connection ready"); log("Connected. You can now send text or files."); });
    channel.addEventListener("close", () => { setConnected(false); setStatus("Connection closed"); });
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
          anchor.href = url; anchor.download = incoming.name; anchor.click();
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

  async function createOffer() {
    const peer = makePeer();
    const channel = peer.createDataChannel("kevin6-transfer", { ordered: true });
    prepareChannel(channel);
    await peer.setLocalDescription(await peer.createOffer());
    setStatus("Creating one-time offer…");
    await waitForIce(peer);
    setCode(JSON.stringify(peer.localDescription));
    setStatus("Offer ready — copy it to the other browser");
  }

  async function acceptOffer() {
    try {
      const peer = makePeer();
      await peer.setRemoteDescription(JSON.parse(code));
      await peer.setLocalDescription(await peer.createAnswer());
      setStatus("Creating one-time answer…");
      await waitForIce(peer);
      setCode(JSON.stringify(peer.localDescription));
      setStatus("Answer ready — copy it back to the first browser");
    } catch {
      setStatus("That offer code is not valid");
    }
  }

  async function applyAnswer() {
    try {
      const peer = peerRef.current;
      if (!peer) throw new Error();
      await peer.setRemoteDescription(JSON.parse(code));
      setStatus("Connecting directly…");
    } catch {
      setStatus("That answer code is not valid, or the offer was not created here");
    }
  }

  function sendText() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open" || !message.trim()) return;
    channel.send(JSON.stringify({ kind: "text", text: message }));
    log(message); setMessage("");
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
      <div className="panel-title"><span>Pair browsers</span><span>{connected ? "CONNECTED" : "MANUAL SIGNAL"}</span></div>
      <p className="privacy-note"><span>●</span> Pairing codes contain connection details only. Files travel browser to browser and are not stored by Kevin6.</p>
      <div className="status-box good">{status}</div>
      <div className="step"><span className="step-number">A</span><div><p className="field-label">On the first browser</p><button className="button primary" onClick={createOffer}>Create offer code</button></div></div>
      <div className="step"><span className="step-number">B</span><div><p className="field-label">Copy the code between browsers</p><textarea className="code-area" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a one-time offer or answer code here" /><div className="button-row"><button className="button" onClick={() => navigator.clipboard.writeText(code)} disabled={!code}>Copy code</button><button className="button" onClick={() => navigator.clipboard.readText().then(setCode)}>Paste code</button></div></div></div>
      <div className="step"><span className="step-number">C</span><div><p className="field-label">Second browser: accept offer. First browser: apply answer.</p><div className="button-row"><button className="button" onClick={acceptOffer} disabled={!code}>Accept offer</button><button className="button" onClick={applyAnswer} disabled={!code}>Apply answer</button></div></div></div>
    </div>
    <div className="connection-panel">
      <div className="panel-title"><span>Send directly</span><span>END-TO-END ENCRYPTED</span></div>
      <div className="field"><label>Text</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type or paste a message" /><button className="button primary" disabled={!connected || !message.trim()} onClick={sendText}>Send text</button></div>
      <div className="step"><span className="step-number">FILE</span><div><FileDrop onFile={setFile} /><p className="field-label">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a file after connecting"}</p><button className="button primary" disabled={!connected || !file} onClick={sendFile}>Send file</button></div></div>
      <div className="panel-title"><span>Activity</span><span>{logs.length}</span></div>
      <div className="message-log">{logs.length ? logs.map((item) => <div className={`message ${item.remote ? "remote" : ""}`} key={item.id}>{item.text}</div>) : <div className="empty-state"><strong>No activity yet</strong><span>Pair another browser to start</span></div>}</div>
    </div>
  </section>;
}
