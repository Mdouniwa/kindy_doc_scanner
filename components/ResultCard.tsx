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
        <div className="w-full bg-white/80 backdrop-blur-md rounded-2xl shadow-xl p-6 border border-indigo-100">
            {showBadge && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                        行事 {index} / {total}
                    </span>
                    {needsReminder && (
                        <span className="bg-pink-100 text-pink-600 text-xs font-semibold px-3 py-1 rounded-full">
                            🔔 要通知
                        </span>
                    )}
                </div>
            )}

            <div className="space-y-3">
                {/* タイトル */}
                <div className="flex items-start gap-3 p-3 bg-indigo-50 rounded-xl">
                    <span className="text-2xl">🎯</span>
                    <div>
                        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">タイトル</p>
                        <p className="text-lg font-semibold text-gray-800">{title || "不明"}</p>
                    </div>
                </div>

                {/* 日付・時間 */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-xl">
                        <span className="text-2xl">📅</span>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">日付</p>
                            <p className="text-base font-semibold text-gray-800 break-words">{date || "不明"}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-sky-50 rounded-xl">
                        <span className="text-2xl">🕐</span>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide">時間</p>
                            <p className="text-base font-semibold text-gray-800 break-words">{time || "不明"}</p>
                        </div>
                    </div>
                </div>

                {/* リマインダー（単体表示の場合のみ） */}
                {!showBadge && (
                    <div className="flex items-start gap-3 p-3 bg-pink-50 rounded-xl">
                        <span className="text-2xl">{needsReminder ? "🔔" : "🔕"}</span>
                        <div>
                            <p className="text-xs font-semibold text-pink-400 uppercase tracking-wide">リマインダー</p>
                            <p className={`text-lg font-semibold ${needsReminder ? "text-pink-600" : "text-gray-500"}`}>
                                {needsReminder ? "要通知（重要）" : "通知不要"}
                            </p>
                        </div>
                    </div>
                )}

                {/* Perplexity アドバイス */}
                {advice && (
                    <div className="mt-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                        <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-2">
                            💡 準備アドバイス（Perplexity AI）
                        </p>
                        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{advice}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
