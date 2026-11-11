import { useCallback, useEffect, useState } from "react";

export default function useDevices() {
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });

  // Call again after mic permission is granted, because labels are empty before that.
  const refresh = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices({
      inputs: list.filter((d) => d.kind === "audioinput"),
      outputs: list.filter((d) => d.kind === "audiooutput"),
    });
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  return { ...devices, refresh };
}