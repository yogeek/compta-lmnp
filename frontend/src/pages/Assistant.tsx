import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, BookOpen } from "lucide-react";
import { assistantApi } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  disclaimer?: string;
}

interface FaqItem {
  question: string;
  answer: string;
  cgi_ref?: string;
}

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [showFaq, setShowFaq] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    assistantApi.faq().then((r) => setFaq(r.data));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (question: string) => {
    if (!question.trim()) return;
    setShowFaq(false);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const r = await assistantApi.ask(question);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: r.data.answer,
          disclaimer: r.data.disclaimer,
        },
      ]);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: detail || "L'assistant IA n'est pas disponible. Consultez la FAQ ci-dessous.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 2rem)" }}>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-6 h-6 text-primary-600" />
          <h2 className="text-2xl font-bold text-gray-900">Assistant fiscal LMNP</h2>
        </div>
        <p className="text-gray-500 text-sm">
          Posez vos questions sur le LMNP réel simplifié — réponses à titre informatif uniquement.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {showFaq && faq.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-primary-600" />
              <h3 className="font-semibold text-sm">Questions fréquentes</h3>
            </div>
            <div className="space-y-2">
              {faq.map((item, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(item.question)}
                  className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50 text-sm transition-colors"
                >
                  <p className="font-medium text-gray-800">{item.question}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-primary-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.disclaimer && (
                <p className="mt-2 text-xs opacity-70 border-t border-gray-100 pt-2">{msg.disclaimer}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Posez votre question LMNP…"
          className="form-input flex-1"
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="btn-primary"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
