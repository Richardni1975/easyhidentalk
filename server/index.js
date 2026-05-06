const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

// Increase keep-alive timeout for Render proxy compatibility
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  cookie: false,
});

// In production, serve the built frontend
const path = require("path");
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// In-memory room state
const rooms = new Map(); // roomId -> Map of peerId -> participantInfo
const roomPolls = new Map(); // roomId -> Map of pollId -> pollData
const roomMessages = new Map(); // roomId -> array of chat messages
const roomPromoted = new Map(); // roomId -> string[] of promoted peerIds

// Map peerId -> socket.id for direct messaging (offer/answer/ICE)
const peerSockets = new Map();

// Helper: anonymize poll votes for momo mode broadcast
function anonymizePoll(poll) {
  if (poll.votingMode !== "momo") return poll;
  return {
    ...poll,
    options: poll.options.map((opt) => ({
      ...opt,
      votes: opt.votes.map(() => ({
        peerId: "anonymous",
        voterName: "momo",
        identity: "momo",
      })),
    })),
  };
}

io.engine.on("connection_error", (err) => {
  console.error("[Engine] Connection error:", err.code, err.message, err.context);
});

io.on("connection", (socket) => {
  let currentRoom = null;
  let currentPeerId = null;

  socket.on("error", (err) => {
    console.error(`[Socket] ${currentPeerId} error:`, err.message);
  });

  socket.on("join-room", ({ roomId, peerId, userName, isMomo }) => {
    currentRoom = roomId;
    currentPeerId = peerId;

    socket.join(roomId);
    peerSockets.set(peerId, socket.id); // map peerId -> socket.id for direct messages

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId);
    const isHost = room.size === 0; // first joiner is host

    const participantInfo = {
      peerId,
      userName: isMomo ? "momo" : userName,
      realName: userName,
      isMomo,
      isHost,
      joinedAt: Date.now(),
      muted: false,
      cameraOff: false,
      handRaised: false,
    };

    room.set(peerId, participantInfo);

    // Notify existing participants about the new peer
    const existingParticipants = Array.from(room.entries())
      .filter(([id]) => id !== peerId)
      .map(([id, info]) => ({ peerId: id, ...info }));

    socket.emit("existing-participants", existingParticipants);

    // Send promoted list to new joiner
    socket.emit("existing-promoted", { promotedPeerIds: roomPromoted.get(roomId) || [] });

    // Send existing polls to the new joiner (anonymize momo-mode polls)
    const existingPolls = roomPolls.get(roomId);
    if (existingPolls && existingPolls.size > 0) {
      const pollsForJoiner = Array.from(existingPolls.values()).map((p) => anonymizePoll(p));
      socket.emit("existing-polls", pollsForJoiner);
    }

    // Send existing chat messages to the new joiner
    const existingMsgs = roomMessages.get(roomId);
    if (existingMsgs && existingMsgs.length > 0) {
      socket.emit("existing-messages", existingMsgs);
    }

    // Notify others that someone joined
    socket.to(roomId).emit("user-joined", participantInfo);

    console.log(`[${roomId}] ${userName} (${peerId}) joined. Total: ${room.size}`);
  });

  socket.on("offer", ({ to, offer }) => {
    const targetSocketId = peerSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", { from: currentPeerId, offer });
    }
  });

  socket.on("answer", ({ to, answer }) => {
    const targetSocketId = peerSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", { from: currentPeerId, answer });
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const targetSocketId = peerSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", { from: currentPeerId, candidate });
    }
  });

  socket.on("chat-message", ({ text }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const sender = room?.get(currentPeerId);
    if (!sender) return;

    const msg = {
      senderId: currentPeerId,
      senderName: sender?.isMomo ? "momo" : sender?.realName || "Unknown",
      isMomo: sender?.isMomo || false,
      text,
      timestamp: Date.now(),
    };

    // Store on server so late joiners see it
    if (!roomMessages.has(currentRoom)) {
      roomMessages.set(currentRoom, []);
    }
    roomMessages.get(currentRoom).push(msg);

    // Broadcast to ALL in room (including sender, for consistency)
    io.to(currentRoom).emit("chat-message", msg);
  });

  socket.on("voice-message", ({ audioData, duration }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const sender = room?.get(currentPeerId);
    socket.to(currentRoom).emit("voice-message", {
      senderId: currentPeerId,
      senderName: sender?.isMomo ? "momo" : sender?.realName || "Unknown",
      isMomo: sender?.isMomo || false,
      audioData,
      duration,
      timestamp: Date.now(),
    });
  });

  socket.on("momo-toggle", ({ isMomo }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const participant = room?.get(currentPeerId);
    if (participant) {
      participant.isMomo = isMomo;
      io.to(currentRoom).emit("user-updated", {
        peerId: currentPeerId,
        isMomo,
        userName: isMomo ? "momo" : participant.realName,
      });
    }
  });

  socket.on("raise-hand", ({ raised }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const participant = room?.get(currentPeerId);
    if (participant) {
      participant.handRaised = raised;
      io.to(currentRoom).emit("hand-raise", { peerId: currentPeerId, raised });
    }
  });

  socket.on("user-mute", ({ muted }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const participant = room?.get(currentPeerId);
    if (participant) {
      participant.muted = muted;
      io.to(currentRoom).emit("user-muted", { peerId: currentPeerId, muted });
    }
  });

  socket.on("user-camera", ({ cameraOff }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const participant = room?.get(currentPeerId);
    if (participant) {
      participant.cameraOff = cameraOff;
      io.to(currentRoom).emit("user-camera", { peerId: currentPeerId, cameraOff });
    }
  });

  socket.on("emoji", ({ emoji }) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit("emoji", { peerId: currentPeerId, emoji });
  });

  socket.on("share-url", ({ url, senderName }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("share-url", {
      url,
      sharedBy: currentPeerId,
      senderName,
      timestamp: Date.now(),
    });
  });

  socket.on("share-text", ({ text, fileName, senderName, mimeType }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("share-text", {
      text,
      fileName,
      mimeType,
      sharedBy: currentPeerId,
      senderName,
      timestamp: Date.now(),
    });
  });

  socket.on("stop-share", () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("stop-share", {
      sharedBy: currentPeerId,
    });
  });

  socket.on("start-screen-share", () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("screen-share-started", {
      peerId: currentPeerId,
    });
  });

  socket.on("stop-screen-share", () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("screen-share-stopped", {
      peerId: currentPeerId,
    });
  });

  // --- Host promotion events ---

  socket.on("promote-participant", ({ peerId: targetPeerId }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const sender = room?.get(currentPeerId);
    if (!sender || !sender.isHost) return;
    if (targetPeerId === currentPeerId) return; // can't promote self

    if (!roomPromoted.has(currentRoom)) {
      roomPromoted.set(currentRoom, []);
    }
    const promoted = roomPromoted.get(currentRoom);
    if (!promoted.includes(targetPeerId)) {
      promoted.push(targetPeerId);
      io.to(currentRoom).emit("promoted-updated", { promotedPeerIds: [...promoted] });
      console.log(`[${currentRoom}] Host promoted ${targetPeerId}`);
    }
  });

  socket.on("demote-participant", ({ peerId: targetPeerId }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const sender = room?.get(currentPeerId);
    if (!sender || !sender.isHost) return;

    const promoted = roomPromoted.get(currentRoom);
    if (!promoted) return;
    const filtered = promoted.filter((id) => id !== targetPeerId);
    roomPromoted.set(currentRoom, filtered);
    io.to(currentRoom).emit("promoted-updated", { promotedPeerIds: filtered });
    console.log(`[${currentRoom}] Host demoted ${targetPeerId}`);
  });

  // --- Poll events ---

  socket.on("create-poll", ({ question, optionsTexts, votingMode }) => {
    if (!currentRoom || !currentPeerId) return;
    const room = rooms.get(currentRoom);
    const sender = room?.get(currentPeerId);
    if (!sender) return;

    const pollId = `poll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pollData = {
      pollId,
      question,
      votingMode: votingMode || "real",
      options: optionsTexts.map((t) => ({ text: t, votes: [] })),
      creatorPeerId: currentPeerId,
      creatorName: sender.isMomo ? "momo" : sender.realName || "Unknown",
      status: "open",
      timestamp: Date.now(),
    };

    if (!roomPolls.has(currentRoom)) {
      roomPolls.set(currentRoom, new Map());
    }
    roomPolls.get(currentRoom).set(pollId, pollData);

    // Always broadcast full data for newly created polls (no votes yet anyway)
    io.to(currentRoom).emit("poll-created", anonymizePoll(pollData));
  });

  socket.on("vote-poll", ({ pollId, optionIndex, identity }) => {
    if (!currentRoom || !currentPeerId) return;
    const polls = roomPolls.get(currentRoom);
    if (!polls) return;
    const poll = polls.get(pollId);
    if (!poll || poll.status !== "open") return;

    // Get voter info
    const room = rooms.get(currentRoom);
    const sender = room?.get(currentPeerId);
    if (!sender) return;

    // Check duplicate vote
    const alreadyVoted = poll.options.some((opt) => opt.votes.some((v) => v.peerId === currentPeerId));
    if (alreadyVoted) {
      socket.emit("poll-error", { message: "你已经投过票了" });
      return;
    }

    const option = poll.options[optionIndex];
    if (!option) return;

    const resolvedIdentity = identity || (poll.votingMode === "momo" ? "momo" : "real");
    const voterName =
      resolvedIdentity === "momo" ? "momo" : sender.realName || "Unknown";

    option.votes.push({ peerId: currentPeerId, voterName, identity: resolvedIdentity });

    // For momo mode, broadcast anonymized; for real/mixed, broadcast full data
    io.to(currentRoom).emit("poll-updated", anonymizePoll(poll));
  });

  socket.on("close-poll", ({ pollId }) => {
    if (!currentRoom || !currentPeerId) return;
    const polls = roomPolls.get(currentRoom);
    if (!polls) return;
    const poll = polls.get(pollId);
    if (!poll || poll.status !== "open") return;
    if (poll.creatorPeerId !== currentPeerId) return;

    poll.status = "closed";
    io.to(currentRoom).emit("poll-closed", anonymizePoll(poll));
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] ${currentPeerId} disconnected. Reason: ${reason}`);
    if (currentPeerId) {
      peerSockets.delete(currentPeerId);
    }
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      const wasHost = room.get(currentPeerId)?.isHost;
      room.delete(currentPeerId);

      // Remove from promoted list
      if (roomPromoted.has(currentRoom)) {
        const promoted = roomPromoted.get(currentRoom);
        const filtered = promoted.filter((id) => id !== currentPeerId);
        if (filtered.length !== promoted.length) {
          roomPromoted.set(currentRoom, filtered);
          io.to(currentRoom).emit("promoted-updated", { promotedPeerIds: filtered });
        }
      }

      if (room.size === 0) {
        rooms.delete(currentRoom);
        roomPromoted.delete(currentRoom);
      } else {
        // If the host left, promote the earliest-remaining participant
        if (wasHost) {
          const firstRemaining = Array.from(room.entries())[0];
          if (firstRemaining) {
            const [newHostId, newHostInfo] = firstRemaining;
            newHostInfo.isHost = true;
            io.to(currentRoom).emit("user-updated", {
              peerId: newHostId,
              isHost: true,
            });
          }
        }
      }

      io.to(currentRoom).emit("user-left", { peerId: currentPeerId });
      console.log(`[${currentRoom}] Peer ${currentPeerId} left. Remaining: ${room.size}`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
