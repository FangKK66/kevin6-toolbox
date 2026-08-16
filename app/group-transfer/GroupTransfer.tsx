"use client";

import { useEffect, useRef, useState } from "react";
import { FileDrop } from "../components/FileDrop";
import { formatBytes } from "../lib/image";

type RoomMode = "idle" | "hosting" | "joining";
type PeerStatus = "connecting" | "connected" | "failed";
type TransferStatus = "active" | "complete" | "error";
type Participant = { id: string; status: PeerStatus };
type RecipientProgress = { peerId: string; label: string; progress: number; status: TransferStatus };
type ActivityItem = {
  id: string;
  text: string;
  remote?: boolean;
  progress?: number;
  status?: TransferStatus;
  recipients?: RecipientProgress[];
};
type IncomingFile = {
  id: string;
  activityId: string;
  name: string;
  type: string;
  size: number;
  chunks: ArrayBuffer[];
  received: number;
  lastProgress: number;
};
type OutgoingFile = { activityId: string; name: string; size: number; pending: Set<string>; failed: boolean };
type PeerEntry = { peer: RTCPeerConnection; channel: RTCDataChannel | null; timeout: number | null };

const MAX_DEVICES = 4;
const CONNECTION_TIMEOUT_MS = 15_000;
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
  const values = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(values, (value) => EMOJIS[value % EMOJIS.length]);
}

function validEmojiCode(value: string) {
  const symbols = Array.from(value);
  return symbols.length === 6 && symbols.every((symbol) => EMOJIS.includes(symbol));
}

function deviceLabel(id: string) {
  return `Device ${id.slice(0, 4).toUpperCase()}`;
}

export function GroupTransfer() {
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef("");
  const peersRef = useRef(new Map<string, PeerEntry>());
  const incomingRef = useRef(new Map<string, IncomingFile>());
  const outgoingRef = useRef(new Map<string, OutgoingFile>());
  const autoJoinedRef = useRef(false);
  const [mode, setMode] = useState<RoomMode>("idle");
  const [selectedCode, setSelectedCode] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState<string[]>([]);
  const [roomUrl, setRoomUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomAccepted, setRoomAccepted] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [status, setStatus] = useState("Create a group room or enter six emojis");
  const [roomError, setRoomError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const canSend = selectedRecipients.some((id) => peersRef.current.get(id)?.channel?.readyState === "open");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room") ?? "";
    if (!autoJoinedRef.current && validEmojiCode(code)) {
      autoJoinedRef.current = true;
      const symbols = Array.from(code);
      setSelectedCode(symbols);
      setRoomCode(symbols);
      connectRoom(code, "joining");
    }
    return () => closeRoom();
  // QR auto-join should only run on initial mount.
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

  function addActivity(item: Omit<ActivityItem, "id">) {
    const id = crypto.randomUUID();
    setActivities((items) => [...items, { id, ...item }]);
    return id;
  }

  function updateActivity(id: string, changes: Partial<ActivityItem>) {
    setActivities((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  function updateRecipient(activityId: string, peerId: string, changes: Partial<RecipientProgress>) {
    setActivities((items) => items.map((item) => item.id !== activityId ? item : {
      ...item,
      recipients: item.recipients?.map((recipient) => recipient.peerId === peerId ? { ...recipient, ...changes } : recipient),
    }));
  }

  function setParticipantStatus(id: string, nextStatus: PeerStatus) {
    setParticipants((items) => items.some((item) => item.id === id)
      ? items.map((item) => item.id === id ? { ...item, status: nextStatus } : item)
      : [...items, { id, status: nextStatus }]);
  }

  function signal(to: string, payload: RTCSessionDescriptionInit) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "signal", to, payload }));
    }
  }

  function markPeerTransfersFailed(peerId: string) {
    for (const [transferId, transfer] of outgoingRef.current) {
      if (!transfer.pending.has(peerId)) continue;
      transfer.pending.delete(peerId);
      transfer.failed = true;
      updateRecipient(transfer.activityId, peerId, { status: "error" });
      if (!transfer.pending.size) {
        outgoingRef.current.delete(transferId);
        updateActivity(transfer.activityId, { status: "error" });
        setSending(false);
      }
    }
  }

  function removePeer(peerId: string) {
    const entry = peersRef.current.get(peerId);
    if (entry?.timeout !== null) window.clearTimeout(entry.timeout);
    entry?.channel?.close();
    entry?.peer.close();
    peersRef.current.delete(peerId);
    incomingRef.current.delete(peerId);
    markPeerTransfersFailed(peerId);
    setParticipants((items) => items.filter((item) => item.id !== peerId));
    setSelectedRecipients((items) => items.filter((id) => id !== peerId));
  }

  function prepareChannel(peerId: string, channel: RTCDataChannel) {
    const entry = peersRef.current.get(peerId);
    if (entry) entry.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      const current = peersRef.current.get(peerId);
      if (current?.timeout !== null) window.clearTimeout(current.timeout);
      if (current) current.timeout = null;
      setParticipantStatus(peerId, "connected");
      setSelectedRecipients((items) => items.includes(peerId) ? items : [...items, peerId]);
      setRoomError(null);
      setStatus("Group room ready");
      addActivity({ text: `${deviceLabel(peerId)} connected.` });
    });
    channel.addEventListener("close", () => {
      if (!peersRef.current.has(peerId)) return;
      setParticipantStatus(peerId, "failed");
      setSelectedRecipients((items) => items.filter((id) => id !== peerId));
      markPeerTransfersFailed(peerId);
    });
    channel.addEventListener("message", (event) => handleChannelMessage(peerId, channel, event));
  }

  function makePeer(peerId: string, initiator: boolean) {
    removePeer(peerId);
    setParticipantStatus(peerId, "connecting");
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }],
    });
    const entry: PeerEntry = { peer, channel: null, timeout: null };
    peersRef.current.set(peerId, entry);
    peer.addEventListener("datachannel", (event) => prepareChannel(peerId, event.channel));
    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "failed") {
        setParticipantStatus(peerId, "failed");
        setSelectedRecipients((items) => items.filter((id) => id !== peerId));
        markPeerTransfersFailed(peerId);
      }
      if (peer.connectionState === "connected") setParticipantStatus(peerId, "connected");
    });
    entry.timeout = window.setTimeout(() => {
      if (entry.channel?.readyState !== "open") {
        setParticipantStatus(peerId, "failed");
        setSelectedRecipients((items) => items.filter((id) => id !== peerId));
        setRoomError(`${deviceLabel(peerId)} could not connect directly. Public Wi-Fi isolation or a firewall may be blocking this device.`);
      }
    }, CONNECTION_TIMEOUT_MS);
    if (initiator) {
      const channel = peer.createDataChannel("kevin6-group-transfer", { ordered: true });
      prepareChannel(peerId, channel);
    }
    return peer;
  }

  async function offerPeer(peerId: string) {
    const peer = makePeer(peerId, true);
    await peer.setLocalDescription(await peer.createOffer());
    await waitForIce(peer);
    if (peer.localDescription) signal(peerId, peer.localDescription);
  }

  async function receiveSignal(from: string, payload: RTCSessionDescriptionInit) {
    if (payload.type === "offer") {
      const peer = makePeer(from, false);
      await peer.setRemoteDescription(payload);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIce(peer);
      if (peer.localDescription) signal(from, peer.localDescription);
    } else if (payload.type === "answer") {
      await peersRef.current.get(from)?.peer.setRemoteDescription(payload);
    }
  }

  function handleChannelMessage(peerId: string, channel: RTCDataChannel, event: MessageEvent) {
    if (typeof event.data === "string") {
      const payload = JSON.parse(event.data) as { kind: string; id?: string; text?: string; name?: string; type?: string; size?: number };
      if (payload.kind === "text") addActivity({ text: `${deviceLabel(peerId)}: ${payload.text ?? ""}`, remote: true });
      if (payload.kind === "file-start" && payload.id && payload.name && typeof payload.size === "number") {
        const activityId = addActivity({ text: `Receiving ${payload.name} from ${deviceLabel(peerId)}`, remote: true, progress: 0, status: "active" });
        incomingRef.current.set(peerId, {
          id: payload.id,
          activityId,
          name: payload.name,
          type: payload.type || "application/octet-stream",
          size: payload.size,
          chunks: [],
          received: 0,
          lastProgress: 0,
        });
      }
      const incoming = incomingRef.current.get(peerId);
      if (payload.kind === "file-end" && incoming && payload.id === incoming.id) {
        if (incoming.received !== incoming.size) {
          updateActivity(incoming.activityId, { text: `Could not receive ${incoming.name} — file was incomplete`, status: "error" });
          channel.send(JSON.stringify({ kind: "file-failed", id: incoming.id }));
          incomingRef.current.delete(peerId);
          return;
        }
        const blob = new Blob(incoming.chunks, { type: incoming.type });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = incoming.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        updateActivity(incoming.activityId, { text: `Downloaded ${incoming.name} from ${deviceLabel(peerId)}`, progress: 100, status: "complete" });
        channel.send(JSON.stringify({ kind: "file-received", id: incoming.id }));
        incomingRef.current.delete(peerId);
      }
      if ((payload.kind === "file-received" || payload.kind === "file-failed") && payload.id) {
        const outgoing = outgoingRef.current.get(payload.id);
        if (!outgoing || !outgoing.pending.has(peerId)) return;
        outgoing.pending.delete(peerId);
        if (payload.kind === "file-failed") outgoing.failed = true;
        updateRecipient(outgoing.activityId, peerId, payload.kind === "file-received"
          ? { progress: 100, status: "complete" }
          : { status: "error" });
        if (!outgoing.pending.size) {
          outgoingRef.current.delete(payload.id);
          updateActivity(outgoing.activityId, { status: outgoing.failed ? "error" : "complete" });
          setSending(false);
        }
      }
    } else if (event.data instanceof ArrayBuffer) {
      const incoming = incomingRef.current.get(peerId);
      if (!incoming) return;
      incoming.chunks.push(event.data);
      incoming.received += event.data.byteLength;
      const progress = incoming.size ? Math.min(99, Math.floor((incoming.received / incoming.size) * 100)) : 99;
      if (progress > incoming.lastProgress) {
        incoming.lastProgress = progress;
        updateActivity(incoming.activityId, { progress });
      }
    }
  }

  function connectRoom(code: string, nextMode: Exclude<RoomMode, "idle">) {
    closeRoom();
    setMode(nextMode);
    setRoomAccepted(false);
    setRoomError(null);
    setStatus(nextMode === "hosting" ? "Group room created — waiting for devices" : "Joining group room…");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/toolbox/api/group/${encodeURIComponent(code)}`);
    socketRef.current = socket;
    socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(event.data) as { type: string; participantId?: string; participants?: string[]; from?: string; payload?: RTCSessionDescriptionInit; message?: string };
        if (packet.type === "welcome" && packet.participantId) {
          setRoomAccepted(true);
          selfIdRef.current = packet.participantId;
          const existing = packet.participants ?? [];
          setParticipants(existing.map((id) => ({ id, status: "connecting" })));
          setStatus(existing.length ? "Connecting to the group…" : "Room ready — waiting for other devices");
          for (const peerId of existing) void offerPeer(peerId).catch(() => setParticipantStatus(peerId, "failed"));
        }
        if (packet.type === "participant-joined" && packet.participantId) {
          setParticipantStatus(packet.participantId, "connecting");
          setStatus("A device joined — connecting directly…");
        }
        if (packet.type === "participant-left" && packet.participantId) {
          addActivity({ text: `${deviceLabel(packet.participantId)} left the room.` });
          removePeer(packet.participantId);
        }
        if (packet.type === "signal" && packet.from && packet.payload) {
          void receiveSignal(packet.from, packet.payload).catch(() => {
            setParticipantStatus(packet.from as string, "failed");
            setRoomError(`${deviceLabel(packet.from as string)} could not complete WebRTC negotiation.`);
          });
        }
        if (packet.type === "expired") {
          setRoomError("This group room expired. Create a new room to continue.");
          setStatus("Group room expired");
        }
        if (packet.type === "error") {
          setRoomError(packet.message ?? "This group room is unavailable.");
          setStatus("Could not join the group room");
        }
      } catch {
        setRoomError("A group room message could not be read.");
      }
    });
    socket.addEventListener("error", () => setRoomError("Could not reach the group pairing service."));
  }

  function closeRoom() {
    socketRef.current?.close();
    socketRef.current = null;
    for (const entry of peersRef.current.values()) {
      if (entry.timeout !== null) window.clearTimeout(entry.timeout);
      entry.channel?.close();
      entry.peer.close();
    }
    peersRef.current.clear();
    incomingRef.current.clear();
    outgoingRef.current.clear();
    selfIdRef.current = "";
    setSending(false);
  }

  function resetRoom() {
    closeRoom();
    setMode("idle");
    setSelectedCode([]);
    setRoomCode([]);
    setRoomUrl("");
    setQrUrl("");
    setParticipants([]);
    setRoomAccepted(false);
    setSelectedRecipients([]);
    setRoomError(null);
    setStatus("Create a group room or enter six emojis");
    window.history.replaceState(null, "", "/toolbox/group-transfer/");
  }

  function createRoom() {
    const symbols = randomEmojiCode();
    const code = symbols.join("");
    setRoomCode(symbols);
    setRoomUrl(`${window.location.origin}/toolbox/group-transfer/?room=${encodeURIComponent(code)}`);
    connectRoom(code, "hosting");
  }

  function joinRoom() {
    if (selectedCode.length !== 6) return;
    const code = selectedCode.join("");
    setRoomCode(selectedCode);
    window.history.replaceState(null, "", `/toolbox/group-transfer/?room=${encodeURIComponent(code)}`);
    connectRoom(code, "joining");
  }

  function toggleRecipient(peerId: string) {
    setSelectedRecipients((items) => items.includes(peerId) ? items.filter((id) => id !== peerId) : [...items, peerId]);
  }

  function sendText() {
    if (!message.trim()) return;
    const targets = selectedRecipients.filter((id) => peersRef.current.get(id)?.channel?.readyState === "open");
    for (const id of targets) peersRef.current.get(id)?.channel?.send(JSON.stringify({ kind: "text", text: message }));
    addActivity({ text: `Sent message to ${targets.length} ${targets.length === 1 ? "device" : "devices"}.` });
    setMessage("");
  }

  async function sendFile() {
    if (!file || sending) return;
    const targetIds = selectedRecipients.filter((id) => peersRef.current.get(id)?.channel?.readyState === "open");
    if (!targetIds.length) return;
    const selectedFile = file;
    const transferId = crypto.randomUUID();
    const recipients = targetIds.map((peerId) => ({ peerId, label: deviceLabel(peerId), progress: 0, status: "active" as const }));
    const activityId = addActivity({ text: `Sending ${selectedFile.name} (${formatBytes(selectedFile.size)})`, recipients, status: "active" });
    const outgoing: OutgoingFile = { activityId, name: selectedFile.name, size: selectedFile.size, pending: new Set(targetIds), failed: false };
    outgoingRef.current.set(transferId, outgoing);
    setSending(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      for (const peerId of targetIds) {
        peersRef.current.get(peerId)?.channel?.send(JSON.stringify({ kind: "file-start", id: transferId, name: selectedFile.name, type: selectedFile.type, size: selectedFile.size }));
      }
      const chunkSize = 16 * 1024;
      let lastProgress = 0;
      for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, buffer.byteLength);
        for (const peerId of [...outgoing.pending]) {
          const channel = peersRef.current.get(peerId)?.channel;
          while (channel?.readyState === "open" && channel.bufferedAmount > 1024 * 1024) await new Promise((resolve) => window.setTimeout(resolve, 20));
          if (!channel || channel.readyState !== "open") {
            outgoing.pending.delete(peerId);
            outgoing.failed = true;
            updateRecipient(activityId, peerId, { status: "error" });
            continue;
          }
          channel.send(buffer.slice(offset, end));
        }
        const progress = buffer.byteLength ? Math.min(99, Math.floor((end / buffer.byteLength) * 100)) : 99;
        if (progress > lastProgress) {
          lastProgress = progress;
          for (const peerId of outgoing.pending) updateRecipient(activityId, peerId, { progress });
        }
      }
      for (const peerId of [...outgoing.pending]) {
        peersRef.current.get(peerId)?.channel?.send(JSON.stringify({ kind: "file-end", id: transferId }));
        updateRecipient(activityId, peerId, { progress: 99 });
      }
      if (!outgoing.pending.size) {
        outgoingRef.current.delete(transferId);
        updateActivity(activityId, { status: "error" });
        setSending(false);
      }
    } catch {
      for (const peerId of outgoing.pending) updateRecipient(activityId, peerId, { status: "error" });
      outgoingRef.current.delete(transferId);
      updateActivity(activityId, { status: "error" });
      setSending(false);
    }
  }

  return <section className="tool-workspace transfer-layout">
    <div className="connection-panel">
      <div className="panel-title"><span>Group room</span><span>{mode === "idle" ? "UP TO 4" : roomAccepted ? `${participants.length + 1}/${MAX_DEVICES} DEVICES` : "JOINING"}</span></div>
      <p className="privacy-note"><span>●</span> The room relays connection details only. Text and files travel directly between browsers and are never stored by Kevin6.</p>
      <div className={`status-box ${roomError ? "error" : "good"}`} role={roomError ? "alert" : "status"}>{status}</div>
      {roomError && <div className="connection-error" role="alert"><strong>Connection issue</strong><p>{roomError}</p><div className="connection-diagnostic"><span>Direct connections only</span><code>NO TURN RELAY</code></div></div>}

      {mode === "idle" && <>
        <div className="step"><span className="step-number">A</span><div><p className="field-label">Start a room for up to four devices</p><button className="button primary" onClick={createRoom}>Create group room</button></div></div>
        <div className="pair-divider"><span>OR JOIN A GROUP</span></div>
        <div className="emoji-code group-code" aria-label="Selected group code">{[0, 1, 2, 3, 4, 5].map((index) => <span key={index}>{selectedCode[index] ?? "·"}</span>)}</div>
        <div className="emoji-picker" aria-label="Group room emoji picker">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => setSelectedCode((items) => items.length < 6 ? [...items, emoji] : items)} aria-label={`Choose ${emoji}`}>{emoji}</button>)}</div>
        <div className="button-row pair-actions"><button className="button" disabled={!selectedCode.length} onClick={() => setSelectedCode((items) => items.slice(0, -1))}>Delete</button><button className="button" disabled={!selectedCode.length} onClick={() => setSelectedCode([])}>Clear</button><button className="button primary" disabled={selectedCode.length !== 6} onClick={joinRoom}>Join group</button></div>
      </>}

      {mode !== "idle" && <>
        <div className="room-card">
          <p className="field-label">{mode === "hosting" ? "Invite devices with this QR code or six emojis" : "Group room code"}</p>
          <div className="emoji-code group-code room-code">{roomCode.map((emoji, index) => <span key={`${emoji}-${index}`}>{emoji}</span>)}</div>
          {mode === "hosting" && qrUrl && <img className="pair-qr" src={qrUrl} alt="QR code for this temporary group room" />}
          <p className="field-label">This room supports four devices and expires after ten minutes.</p>
        </div>
        {roomAccepted && <div className="participant-list" aria-label="Group participants">
          <div className="participant connected"><span><i />This device</span><small>CONNECTED</small></div>
          {participants.map((participant) => <label className={`participant ${participant.status}`} key={participant.id}>
            <span><i />{deviceLabel(participant.id)}</span>
            <span><small>{participant.status.toUpperCase()}</small><input type="checkbox" checked={selectedRecipients.includes(participant.id)} disabled={participant.status !== "connected"} onChange={() => toggleRecipient(participant.id)} aria-label={`Send to ${deviceLabel(participant.id)}`} /></span>
          </label>)}
        </div>}
        <button className="button pair-reset" onClick={resetRoom}>Leave group</button>
      </>}
    </div>

    <div className="connection-panel">
      <div className="panel-title"><span>Send to selected</span><span>{selectedRecipients.length} SELECTED</span></div>
      <div className="field"><label>Text</label><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type or paste a message" /><button className="button primary" disabled={!canSend || !message.trim()} onClick={sendText}>Send text</button></div>
      <div className="step"><span className="step-number">FILE</span><div><FileDrop onFile={setFile} label="Choose any file" accept="" /><p className="field-label">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a file after devices connect"}</p><button className="button primary" disabled={!canSend || !file || sending} onClick={sendFile}>{sending ? "Sending file…" : "Send file"}</button></div></div>
      <div className="panel-title"><span>Activity</span><span>{activities.length}</span></div>
      <div className="message-log group-activity">{activities.length ? activities.map((item) => {
        const progress = item.recipients?.length
          ? Math.floor(item.recipients.reduce((total, recipient) => total + recipient.progress, 0) / item.recipients.length)
          : item.progress;
        const hasError = item.status === "error" || item.recipients?.some((recipient) => recipient.status === "error");
        return <div className={`message ${item.remote ? "remote" : ""} ${typeof progress === "number" ? "transfer" : ""} ${hasError ? "error" : item.status ?? ""}`} key={item.id}>
          <div className="message-text">{item.text}{typeof progress === "number" && <span>{progress}%</span>}</div>
          {typeof progress === "number" && <div className="transfer-progress" role="progressbar" aria-label={item.text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
          {item.recipients?.map((recipient) => <div className={`recipient-progress ${recipient.status}`} key={recipient.peerId}><span>{recipient.label}</span><span>{recipient.status === "error" ? "FAILED" : `${recipient.progress}%`}</span></div>)}
        </div>;
      }) : <div className="empty-state"><strong>No activity yet</strong><span>Connect devices and choose recipients</span></div>}</div>
    </div>
  </section>;
}
