"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createBrowserClient } from "../../lib/supabase";

interface EventRow {
    id: string;
    title: string;
    date: string;
    time: string;
    needs_reminder: boolean;
    advice: string;
    created_at: string;
}

interface PrintRow {
    id: string;
    image_url: string;
    created_at: string;
    events: EventRow[];
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function HistoryPage() {
    const [prints, setPrints] = useState<PrintRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const supabase = createBrowserClient();

        const fetchPrints = async () => {
            try {
                const { data, error: fetchError } = await supabase
                    .from("prints")
                    .select("*, events(*)")
                    .order("created_at", { ascending: false });

                if (fetchError) throw fetchError;
                setPrints((data as PrintRow[]) ?? []);
            } catch (err) {
                console.error("Fetch error:", err);
                setError("データの取得に失敗しました。Supabase の設定を確認してください。");
            } finally {
                setLoading(false);
            }
        };

        fetchPrints();
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex flex-col items-center py-10 px-4">
            <header className="mb-8 w-full max-w-2xl flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-indigo-700 drop-shadow">📚 スキャン履歴</h1>
                    <p className="mt-1 text-gray-500 text-sm">保存済みのプリント一覧です</p>
                </div>
                <Link
                    href="/upload"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:bg-indigo-700 transition"
                >
                    ＋ 新しいプリントを読み取る
                </Link>
            </header>

            {loading && (
                <div className="flex flex-col items-center gap-3 mt-16 text-indigo-400">
                    <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <p className="text-sm">読み込み中...</p>
                </div>
            )}

            {error && (
                <div className="mt-8 w-full max-w-2xl bg-red-50 border border-red-200 rounded-2xl p-5 text-red-600 text-sm">
                    {error}
                </div>
            )}

            {!loading && !error && prints.length === 0 && (
                <div className="mt-16 flex flex-col items-center gap-4 text-gray-400">
                    <span className="text-5xl">📭</span>
                    <p className="text-lg font-semibold">履歴がまだありません</p>
                    <p className="text-sm">プリントをアップロードすると自動的に保存されます</p>
                    <Link
                        href="/upload"
                        className="mt-4 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 transition"
                    >
                        ✨ プリントをスキャンする
                    </Link>
                </div>
            )}

            <div className="w-full max-w-2xl space-y-6">
                {prints.map((print) => (
                    <div
                        key={print.id}
                        className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-indigo-100 overflow-hidden"
                    >
                        {/* ヘッダー */}
                        <div className="flex items-center gap-4 p-4 border-b border-indigo-50">
                            {print.image_url ? (
                                <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-indigo-100 bg-indigo-50">
                                    <Image
                                        src={print.image_url}
                                        alt="プリント画像"
                                        width={64}
                                        height={64}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl">
                                    📄
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-400">{formatDate(print.created_at)}</p>
                                <p className="text-sm font-semibold text-indigo-700 mt-0.5">
                                    {print.events?.length ?? 0}件の行事
                                </p>
                            </div>
                        </div>

                        {/* 行事リスト */}
                        <div className="divide-y divide-indigo-50">
                            {(print.events ?? []).map((ev, idx) => (
                                <div key={ev.id} className="p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <p className="font-semibold text-gray-800">{ev.title || "不明"}</p>
                                                {ev.needs_reminder && (
                                                    <span className="text-xs bg-pink-100 text-pink-600 font-semibold px-2 py-0.5 rounded-full">
                                                        🔔 要通知
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                                                {ev.date && (
                                                    <span className="flex items-center gap-1">
                                                        <span>📅</span>
                                                        {ev.date}
                                                    </span>
                                                )}
                                                {ev.time && (
                                                    <span className="flex items-center gap-1">
                                                        <span>🕐</span>
                                                        {ev.time}
                                                    </span>
                                                )}
                                            </div>
                                            {ev.advice && (
                                                <details className="mt-2">
                                                    <summary className="text-xs text-amber-600 font-semibold cursor-pointer hover:text-amber-700">
                                                        💡 アドバイスを見る
                                                    </summary>
                                                    <p className="mt-1 text-xs text-gray-600 whitespace-pre-line leading-relaxed bg-amber-50 rounded-lg p-2 border border-amber-100">
                                                        {ev.advice}
                                                    </p>
                                                </details>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
