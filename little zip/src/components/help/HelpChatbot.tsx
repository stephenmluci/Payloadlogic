'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, RefreshCw, Copy, Check, MessageSquare } from 'lucide-react';
import { STARTER_HELP_QUESTIONS } from '@/lib/helpKnowledgeBase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface HelpChatbotProps {
  hideHeader?: boolean;
  className?: string;
}

export function HelpChatbot({ hideHeader = false, className = '' }: HelpChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content:
        "Hello! I'm your PayloadLogic Help Assistant. Ask me anything about creating loads, deck space consolidation, GCWR compliance, profit calculations, or driver management.",
      timestamp: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 60);
    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const questionText = (textToSend || input).trim();
    if (!questionText || isLoading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build history for API
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          history,
        }),
      });

      let answerText = '';

      // Safely check content type and parse JSON without crashing on plain-text 500s
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const data = await res.json();
          answerText = data.answer || data.error || '';
        } catch (jsonErr) {
          console.warn('Failed to parse JSON from /api/help-chat:', jsonErr);
        }
      } else {
        const text = await res.text();
        console.warn('Received non-JSON response from /api/help-chat:', res.status, text.slice(0, 100));
      }

      if (!answerText) {
        answerText =
          "I couldn't load an answer right now. Please check our Help Topics on the left or reach out directly to support@payloadlogic.app.";
      }

      const botMessage: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        content: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content:
          "Connection issue detected. You can review the Help Topics on the left or email our team directly at support@payloadlogic.app.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content: "Chat cleared. What can I help you with across PayloadLogic today?",
        timestamp: 'Just now',
      },
    ]);
  };

  return (
    <div
      className={`flex flex-col h-full rounded-2xl border border-white/10 bg-[#111d2e] shadow-2xl overflow-hidden ${className}`}
    >
      {/* Header (conditionally rendered) */}
      {!hideHeader && (
        <div className="px-5 py-3.5 border-b border-white/10 bg-[#0c141f] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ffbe24] flex items-center justify-center text-[#0c141f] shadow-md shadow-[#ffbe24]/20 shrink-0">
              <Sparkles className="h-4 w-4 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white">PayloadLogic AI Assistant</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#ffbe24]/15 text-[#ffbe24] border border-[#ffbe24]/30">
                  Gemini
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Instant answers for hotshot dispatchers &amp; drivers</p>
            </div>
          </div>
          <button
            onClick={handleClear}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-xs flex items-center gap-1"
            title="Clear chat"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      )}

      {/* When hideHeader is true, provide a small Reset pill in the corner */}
      {hideHeader && (
        <div className="px-4 py-2 border-b border-white/5 bg-[#0c141f]/80 flex items-center justify-end shrink-0">
          <button
            onClick={handleClear}
            className="text-[11px] text-slate-400 hover:text-white hover:bg-white/5 px-2 py-1 rounded transition-colors flex items-center gap-1"
            title="Clear chat"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reset Chat</span>
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 pt-3 pb-8 overscroll-contain scroll-smooth">
        {messages.map(msg => {
          const isBot = msg.role === 'model';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isBot ? 'items-start' : 'items-start flex-row-reverse'}`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
                  isBot ? 'bg-[#ffbe24] text-[#0c141f]' : 'bg-blue-600 text-white'
                }`}
              >
                {isBot ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              {/* Message Bubble: expands naturally with NO height caps or clipping */}
              <div
                className={`group relative w-fit max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm h-auto min-h-fit ${
                  isBot
                    ? 'bg-[#18273d] border border-white/10 text-slate-100'
                    : 'bg-blue-600 text-white font-medium'
                }`}
              >
                {/* Text Content: wraps cleanly and never truncates */}
                <div className="whitespace-pre-wrap break-words leading-relaxed overflow-x-auto select-text font-normal">
                  {msg.content}
                </div>

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5 text-[10px] text-slate-400">
                  <span>{msg.timestamp}</span>
                  {isBot && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white flex items-center gap-1 text-[11px] ml-2"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 items-start animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-[#ffbe24] text-[#0c141f] flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-[#18273d] border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-400 flex items-center gap-2 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#ffbe24] animate-bounce" />
              <span className="h-2 w-2 rounded-full bg-[#ffbe24] animate-bounce [animation-delay:0.2s]" />
              <span className="h-2 w-2 rounded-full bg-[#ffbe24] animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-slate-400 ml-1">PayloadLogic assistant is thinking...</span>
            </div>
          </div>
        )}

        {/* Generous bottom anchor ensures smooth scrolling past the final word */}
        <div ref={messagesEndRef} className="h-4 shrink-0" />
      </div>

      {/* Starter Suggested Questions */}
      <div className="px-4 py-2.5 bg-[#0e1724] border-t border-white/5 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2 font-medium">
          <MessageSquare className="h-3.5 w-3.5 text-[#ffbe24]" />
          <span>Suggested Questions:</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {STARTER_HELP_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              disabled={isLoading}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 hover:bg-[#ffbe24]/15 hover:text-[#ffbe24] text-slate-300 border border-white/10 hover:border-[#ffbe24]/40 transition-all shrink-0 active:scale-95 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <div className="p-3.5 bg-[#0c141f] border-t border-white/10 shrink-0">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask about loads, GCWR, profit calculation, drivers..."
            className="w-full bg-[#18273d] border border-white/15 focus:border-[#ffbe24] focus:ring-1 focus:ring-[#ffbe24] rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-slate-400 outline-none transition-all shadow-inner"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 p-2 rounded-lg bg-[#ffbe24] hover:bg-[#e6a817] disabled:bg-slate-700 text-[#0c141f] disabled:text-slate-500 transition-all active:scale-95 shadow-md"
            title="Send question"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
          <span>Powered by Gemini for PayloadLogic</span>
          <span>
            Need direct help?{' '}
            <a href="mailto:support@payloadlogic.app" className="text-slate-400 hover:text-[#ffbe24] underline">
              support@payloadlogic.app
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
