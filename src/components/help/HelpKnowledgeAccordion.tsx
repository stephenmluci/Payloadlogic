'use client';

import React, { useState } from 'react';
import { HELP_KNOWLEDGE_BASE, HelpTopic } from '@/lib/helpKnowledgeBase';
import { 
  ChevronDown, ChevronUp, Search, BookOpen, Layers, 
  TrendingUp, Users, Radio, FileText, Settings, CheckCircle2, Lightbulb 
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Loads & Dispatch': BookOpen,
  'Deck Planning & Compliance': Layers,
  'Financials & CPM': TrendingUp,
  'Fleet & Drivers': Users,
  'Operations & Tracking': Radio,
  'Billing & Documents': FileText,
  'Settings & Administration': Settings,
};

export function HelpKnowledgeAccordion() {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(HELP_KNOWLEDGE_BASE[0].id);

  const filteredTopics = HELP_KNOWLEDGE_BASE.filter(topic => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      topic.title.toLowerCase().includes(q) ||
      topic.category.toLowerCase().includes(q) ||
      topic.summary.toLowerCase().includes(q) ||
      topic.details.some(d => d.toLowerCase().includes(q))
    );
  });

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Search Filter */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guides, GCWR, profit formulas, or dispatch rules..."
          className="w-full bg-[#111d2e] border border-white/10 focus:border-[#ffbe24] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-400 outline-none transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Guide Cards */}
      <div className="space-y-3">
        {filteredTopics.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-white/10 bg-[#111d2e] text-slate-400">
            <p className="text-sm font-medium">No guides match your search.</p>
            <p className="text-xs text-slate-500 mt-1">Try asking the AI Assistant on the right or email support@payloadlogic.app.</p>
          </div>
        ) : (
          filteredTopics.map((topic) => {
            const isExpanded = expandedId === topic.id;
            const Icon = CATEGORY_ICONS[topic.category] || BookOpen;

            return (
              <div
                key={topic.id}
                className="rounded-2xl border border-white/10 bg-[#111d2e] overflow-hidden transition-all duration-200 hover:border-white/20"
              >
                {/* Header */}
                <button
                  onClick={() => toggleExpand(topic.id)}
                  className="w-full p-4.5 text-left flex items-start justify-between gap-3 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#ffbe24] shrink-0 mt-0.5">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          {topic.category}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1 leading-snug">
                        {topic.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {topic.summary}
                      </p>
                    </div>
                  </div>
                  <div className="p-1 text-slate-400 shrink-0 mt-1">
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-[#ffbe24]" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 space-y-4 text-xs sm:text-sm text-slate-300 animate-fade-in">
                    {/* Key Details */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Key Highlights</h4>
                      <ul className="space-y-1.5">
                        {topic.details.map((detail, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#ffbe24] shrink-0 mt-2" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Step-by-Step */}
                    {topic.steps && topic.steps.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-[#0c141f] border border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300 mb-2 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                          How to do it in PayloadLogic
                        </h4>
                        <ol className="space-y-1.5 pl-1">
                          {topic.steps.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-slate-300 text-xs">
                              <span className="font-bold text-[#ffbe24] shrink-0">{idx + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Pro Tips */}
                    {topic.tips && topic.tips.length > 0 && (
                      <div className="p-3 rounded-xl bg-[#ffbe24]/5 border border-[#ffbe24]/20 text-xs text-amber-200/90 flex items-start gap-2">
                        <Lightbulb className="h-4 w-4 text-[#ffbe24] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          {topic.tips.map((tip, idx) => (
                            <p key={idx}><strong className="text-[#ffbe24]">Pro Tip:</strong> {tip}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
