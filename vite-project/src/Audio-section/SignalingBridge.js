const EVENTS = ["offer", "answer", "ice", "hangup"];

export default class SignalingBridge {
  constructor(socket) {
    this.socket = socket;
    this.handlers = {};
  }

  sendOffer(to, sdp) {
    this.socket.emit("webrtc:offer", { to, sdp });
  }

  sendAnswer(to, sdp) {
    this.socket.emit("webrtc:answer", { to, sdp });
  }

  sendIce(to, candidate) {
    this.socket.emit("webrtc:ice", { to, candidate });
  }

  sendHangup(to) {
    this.socket.emit("webrtc:hangup", { to });
  }

  // handlers: { offer(from, sdp), answer(from, sdp), ice(from, candidate), hangup(from) }
  listen(handlers) {
    EVENTS.forEach((name) => {
      this.handlers[name] = (data) => handlers[name](data.from, data.sdp ?? data.candidate);
      this.socket.on(`webrtc:${name}`, this.handlers[name]);
    });
  }

  stop() {
    EVENTS.forEach((name) => this.socket.off(`webrtc:${name}`, this.handlers[name]));
  }
}