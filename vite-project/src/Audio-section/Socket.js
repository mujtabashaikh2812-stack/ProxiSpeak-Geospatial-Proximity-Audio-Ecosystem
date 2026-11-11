import { io } from "socket.io-client";

  export const socket = io(import.meta.env.VITE_SOCKET_URL, {
    autoConnect: false,
    auth: { userId: 'santosh-test', username: 'Santosh' },
  });