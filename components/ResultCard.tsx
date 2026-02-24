"use client";
import React from "react";

interface ResultCardProps {
    title: string;
    date: string;
    time: string;
    needsReminder: boolean;
    advice: string;
    index?: number;
    total?: number;
}

export default function ResultCard({
    title,
    date,
    time,
    needsReminder,
    advice,
    index,
    total,
}: ResultCardProps) {
    const showBadge = total !== undefined && total > 1 && index !== undefined;

    return (
        <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* カードヘッダー */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 bg-emerald-50/60">
                {showBadge && (
                    <span className="flex-shrink-0 w-6 h-6 bg-emerald-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {index}
                    </span>
                )}
                <p className="flex-1 font-bold text-slate-800 text-base leading-snug truncate">
                    {title || "不明"}
                </p>
                {needsReminder && (
                    <span className="flex-shrink-0 flex items-center gap-1 bg-rose-100 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-full">
                        🔔 要通知
                    </span>
                )}
            </div>

            {/* 日付・時間 */}
            <div className="grid grid-cols-2 gap-px bg-slate-50 border-b border-slate-50">
                <div className="bg-white px-4 py-3 flex items-start gap-2.5">
                    <span className="text-xl flex-shrink-0 mt-0.5">📅</span>
                    <div className="min-w-0">
                        <p className="text-xs text-slate-400 font-semibold mb-0.5">日付</p>
                        <p className="text-sm font-bold text-slate-800 break-words leading-snug">
                            {date || "不明"}
                        </p>
                    </div>
                </div>
                <div className="bg-white px-4 py-3 flex items-start gap-2.5">
                    <span className="text-xl flex-shrink-0 mt-0.5">🕐</span>
                    <div className="min-w-0">
                        <p className="text-xs text-slate-400 font-semibold mb-0.5">時間</p>
                        <p className="text-sm font-bold text-slate-800 break-words leading-snug">
                            {time || "未記載"}
                        </p>
                    </div>
                </div>
            </div>

            {/* リマインダー（複数行事でないときのみ） */}
            {!showBadge && (
                <div className={`px-4 py-3 flex items-center gap-2.5 border-b border-slate-50 ${needsReminder ? "bg-rose-50" : ""}`}>
                    <span className="text-xl">{needsReminder ? "🔔" : "🔕"}</span>
                    <span className={`text-sm font-semibold ${needsReminder ? "text-rose-600" : "text-slate-400"}`}>
                        {needsReminder ? "要通知（重要な行事です）" : "通知不要"}
                    </span>
                </div>
            )}

            {/* Perplexity アドバイス */}
            {advice && (
                <details className="group">
                    <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none bg-amber-50/60 hover:bg-amber-50 active:bg-amber-100 transition list-none">
                        <span className="text-base">💡</span>
                        <span className="text-sm font-semibold text-amber-700 flex-1">準備アドバイス（AI）</span>
                        <svg
                            className="w-4 h-4 text-amber-400 transition-transform group-open:rotate-180"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <div className="px-4 pb-4 pt-3 bg-white border-t border-amber-100">
                        <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{advice}</p>
                    </div>
                </details>
            )}
        </div>
    );
}
