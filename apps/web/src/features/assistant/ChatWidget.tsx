import { useState, useRef, useEffect, type FormEvent } from "react";
import { sendAssistantMessage, errorMessage } from "../auth/client.js";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 Hi! I'm your SwiftDrop AI Assistant. Ask me for delivery quotes, parcel tracking, service districts, or your recent bookings!",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || pending) return;

    const userMsg: Message = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setPending(true);
    setError("");

    try {
      const response = await sendAssistantMessage(
        text,
        messages.map((m) => ({ role: m.role, content: m.content })),
      );
      setMessages([...newHistory, { role: "assistant", content: response.reply }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSend();
  }

  return (
    <div className="chat-widget-root">
      {!isOpen && (
        <button
          className="chat-floating-button"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI delivery assistant"
        >
          💬 AI Assistant
        </button>
      )}

      {isOpen && (
        <div className="chat-window" role="dialog" aria-label="AI Delivery Assistant">
          <header className="chat-header">
            <div>
              <h3>SwiftDrop AI</h3>
              <span className="chat-subtitle">Grounded delivery tools</span>
            </div>
            <button
              className="chat-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              ✕
            </button>
          </header>

          <div className="chat-messages" role="log" aria-live="polite" aria-atomic="false">
            {messages.map((msg, index) => (
              <div key={index} className={`chat-bubble chat-bubble-${msg.role}`}>
                <div className="chat-bubble-text" style={{ whiteSpace: "pre-wrap" }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="chat-bubble chat-bubble-assistant chat-bubble-typing" role="status" aria-label="Processing request">
                <span>Checking SwiftDrop database…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-suggestions" aria-label="Suggested questions">
            <button
              type="button"
              className="chip-btn"
              onClick={() => void handleSend("How much to send 2 kg from Colombo to Kandy?")}
            >
              Quote 2kg Colombo &rarr; Kandy
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => void handleSend("Which districts do you serve?")}
            >
              Districts
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => void handleSend("Show my parcels")}
            >
              My parcels
            </button>
          </div>

          {error && <div className="chat-error" role="alert">{error}</div>}

          <form className="chat-input-bar" onSubmit={onSubmit}>
            <input
              type="text"
              placeholder="Ask about quotes, tracking, districts…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pending}
              aria-label="Message to assistant"
            />
            <button type="submit" disabled={pending || !input.trim()} className="primary">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
