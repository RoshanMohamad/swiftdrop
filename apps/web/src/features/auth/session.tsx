import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PublicUser, Session } from "@swiftdrop/contracts";
import {
  ApiError,
  allowBootstrap,
  blockBootstrap,
  clearSession,
  errorMessage,
  refreshSession,
  sessionEvents,
  sessionExpiredEvents,
} from "./client.js";
type State = {
  status: "loading" | "anonymous" | "authenticated" | "error";
  user: PublicUser | null;
  message: string;
};
const Context = createContext<{
  state: State;
  accept: (session: Session) => void;
  updateUser: (user: PublicUser) => void;
  clear: () => void;
  bootstrap: () => void;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    status: "loading",
    user: null,
    message: "",
  });
  const generation = useRef(0);
  const clear = useCallback(() => {
    generation.current++;
    clearSession();
    setState({ status: "anonymous", user: null, message: "" });
  }, []);
  const accept = useCallback((session: Session) => {
    generation.current++;
    setState({ status: "authenticated", user: session.user, message: "" });
  }, []);
  const updateUser = useCallback((user: PublicUser) => {
    setState((previous) =>
      previous.status === "authenticated" ? { ...previous, user } : previous,
    );
  }, []);
  const bootstrap = useCallback(() => {
    const request = ++generation.current;
    setState({ status: "loading", user: null, message: "" });
    void refreshSession()
      .then((session) => {
        if (request === generation.current)
          setState({
            status: "authenticated",
            user: session.user,
            message: "",
          });
      })
      .catch((error) => {
        if (request !== generation.current) return;
        if (error instanceof ApiError && error.problem.status === 401)
          setState({ status: "anonymous", user: null, message: "" });
        else
          setState({
            status: "error",
            user: null,
            message: errorMessage(error),
          });
      });
  }, []);
  useEffect(() => {
    bootstrap();
    sessionExpiredEvents.addEventListener("expired", clear);
    const listener = (event: MessageEvent) => {
      if (event.data === "signed-out") {
        blockBootstrap();
        clear();
      }
      if (event.data === "signed-in") {
        allowBootstrap();
        bootstrap();
      }
    };
    sessionEvents?.addEventListener("message", listener);
    return () => {
      generation.current++;
      sessionEvents?.removeEventListener("message", listener);
      sessionExpiredEvents.removeEventListener("expired", clear);
    };
  }, [bootstrap, clear]);
  return (
    <Context.Provider value={{ state, accept, updateUser, clear, bootstrap }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing session provider.");
  return value;
}
export const roleHome = (role: PublicUser["role"]) =>
  ({
    CUSTOMER: "/account",
    MERCHANT: "/merchant/onboarding",
    COURIER: "/courier",
    DISPATCHER: "/dispatcher",
    ADMIN: "/admin",
  })[role];
