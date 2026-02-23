"use client";
import React, { useEffect, useState, useCallback } from "react";
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

// ─── 画像拡大モーダル ─────────────────────────────────────────────────────────

interface ImageModalProps {
    url: string;
    onClose: () => void;
}

function ImageModal({ url, onClose }: ImageModalProps) {
    const [zoomed, setZoomed] = useState(false);

    // ESC キーで閉じる
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    // スクロールをロック
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col select-none">

            {/* ─ ツールバー ─ */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm">
                <p className="text-white/50 text-xs leading-snug">
                    {zoomed
                        ? "スクロールして確認 / タップで縮小"
                        : "タップで拡大 / ピンチでズーム"}
                </p>
                <button
                    onClick={onClose}
                    className="ml-4 flex-shrink-0 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 transition flex items-center justify-center text-white text-base font-bold"
                    aria-label="閉じる"
                >
                    ✕
                </button>
            </div>

            {/* ─ スクロール可能な画像エリア ─
                overflow: auto + 画像幅を切り替えることで
                「スクロールで確認」「ピンチズーム」が自然に動作する */}
            <div
                className="flex-1 overflow-auto bg-black"
                style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={url}
                    alt="プリント（拡大表示）"
                    onClick={() => setZoomed((z) => !z)}
                    style={{
                        display: "block",
                        width: zoomed ? "200%" : "100%",
                        height: "auto",
                        transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        touchAction: "pan-x pan-y pinch-zoom",
                        userSelect: "none",
                        cursor: zoomed ? "zoom-out" : "zoom-in",
                    }}
                />
            </div>

            {/* ─ 下部ヒント ─ */}
            <div className="flex-shrink-0 py-2 text-center bg-black/80 backdrop-blur-sm">
                <p className="text-white/30 text-xs">
                    {zoomed ? "🔍 2× 拡大中" : "🔍 タップで2× 拡大 / ピンチで自由にズーム"}
                </p>
            </div>
        </div>
    );
}

// ─── メインページ ─────────────────────────────────────────────────────────────

export default function HistoryPage() {
    const [prints, setPrints] = useState<PrintRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modalUrl, setModalUrl] = useState<string | null>(null);

    const openModal = useCallback((url: string) => setModalUrl(url), []);
    const closeModal = useCallback(() => setModalUrl(null), []);

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
        <>
            {/* ─── 画像拡大モーダル ─────────────────────────────────────────── */}
            {modalUrl && <ImageModal url={modalUrl} onClose={closeModal} />}

            {/* ─── メインコンテンツ ──────────────────────────────────────────── */}
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

                {/* ─ ローディング ─ */}
                {loading && (
                    <div className="flex flex-col items-center gap-3 mt-16 text-indigo-400">
                        <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        <p className="text-sm">読み込み中...</p>
                    </div>
                )}

                {/* ─ エラー ─ */}
                {error && (
                    <div className="mt-8 w-full max-w-2xl bg-red-50 border border-red-200 rounded-2xl p-5 text-red-600 text-sm">
                        {error}
                    </div>
                )}

                {/* ─ 空状態 ─ */}
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

                {/* ─ プリントカード一覧 ─ */}
                <div className="w-full max-w-2xl space-y-6">
                    {prints.map((print) => (
                        <div
                            key={print.id}
                            className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-indigo-100 overflow-hidden"
                        >
                            {/* ── 画像エリア（全幅・クリックで拡大） ── */}
                            {print.image_url ? (
                                <button
                                    type="button"
                                    onClick={() => openModal(print.image_url)}
                                    className="relative w-full block overflow-hidden group bg-gray-50 active:brightness-95 transition"
                                    aria-label="画像を拡大表示"
                                >
                                    <Image
                                        src={print.image_url}
                                        alt="プリント画像"
                                        width={800}
                                        height={600}
                                        quality={90}
                                        className="w-full h-auto object-contain"
                                        style={{ display: "block" }}
                                    />
                                    {/* 拡大ヒントバッジ — 常時表示でスマホにも分かりやすく */}
                                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow">
                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                        </svg>
                                        タップで拡大
                                    </div>
                                </button>
                            ) : (
                                <div className="w-full h-24 bg-indigo-50 flex items-center justify-center text-gray-400 text-sm gap-2">
                                    <span className="text-2xl">📄</span>
                                    <span>画像なし</span>
                                </div>
                            )}

                            {/* ── メタ情報 ── */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-50">
                                <p className="text-xs text-gray-400">{formatDate(print.created_at)}</p>
                                <span className="bg-indigo-100 text-indigo-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                                    {print.events?.length ?? 0}件の行事
                                </span>
                            </div>

                            {/* ── 行事リスト ── */}
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
                                                            <span>📅</span>{ev.date}
                                                        </span>
                                                    )}
                                                    {ev.time && (
                                                        <span className="flex items-center gap-1">
                                                            <span>🕐</span>{ev.time}
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
        </>
    );
}
