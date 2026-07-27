import { useEffect, useState } from "react";

export interface OnlineStatus {
  online: boolean;
  wasOffline: boolean;
}

export function useOnlineStatus(): OnlineStatus {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setWasOffline(true);
      setTimeout(() => setWasOffline(false), 4000);
    };
    const handleOffline = () => {
      setOnline(false);
      setWasOffline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online, wasOffline };
}
