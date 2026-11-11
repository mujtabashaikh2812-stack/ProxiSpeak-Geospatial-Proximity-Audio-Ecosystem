import { useEffect, useRef } from "react";
import SignalingBridge from "./SignalingBridge";
import MultiPeerCoordinator from "./MultiPeerCoordinator";

export default function useVoiceMesh({ socket, myId, stream }) {
  const mesh = useRef(null);

  useEffect(() => {
    mesh.current = new MultiPeerCoordinator(new SignalingBridge(socket), myId);
    return () => mesh.current.closeAll();
  }, [socket, myId]);

  useEffect(() => {
    mesh.current?.setLocalStream(stream);
  }, [stream]);

  return mesh;
}