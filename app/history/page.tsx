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

interface ConfirmDialogState {
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
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

// ─── 確認ダイアログ ───────────────────────────────────────────────────────────

function ConfirmDialog({
    title,
    message,
    confirmLabel,
    onConfirm,
    onCancel,
}: ConfirmDialogState & { onCancel: () => void }) {
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    return (
        <div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 pt-6 pb-4">
                    <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">{message}</p>
                </div>
                <div className="flex border-t border-slate-100">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-4 text-sm font-semibold text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition"
                    >
                        キャンセル
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-4 text-sm font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 画像拡大モーダル ─────────────────────────────────────────────────────────

function ImageModal({ url, onClose }: { url: string; onClose: () => void }) {
    const [zoomed, setZoomed] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col select-none">
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm">
                <p className="text-white/50 text-xs">
                    {zoomed ? "スクロールして確認 / タップで縮小" : "タップで拡大 / ピンチでズーム"}
                </p>
                <button
                    onClick={onClose}
                    className="ml-4 flex-shrink-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 transition flex items-center justify-center text-white font-bold"
                    aria-label="閉じる"
                >
                    ✕
                </button>
            </div>
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
    const [fetchError, setFetchError] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [modalUrl, setModalUrl] = useState<string | null>(null);

    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

    const openModal = useCallback((url: string) => setModalUrl(url), []);
    const closeModal = useCallback(() => setModalUrl(null), []);

    // ── データ取得 ────────────────────────────────────────────────────────────
    const fetchPrints = useCallback(async () => {
        setFetchError("");
        const supabase = createBrowserClient();
        try {
            const { data, error } = await supabase
                .from("prints")
                .select("*, events(*)")
                .order("created_at", { ascending: false });
            if (error) throw error;
            setPrints((data as PrintRow[]) ?? []);
        } catch (e) {
            console.error("Fetch error:", e);
            setFetchError("データの取得に失敗しました。Supabase の設定を確認してください。");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPrints(); }, [fetchPrints]);

    // ── 選択操作 ──────────────────────────────────────────────────────────────
    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const enterSelectMode = useCallback(() => {
        setSelectMode(true);
        setSelectedIds(new Set());
    }, []);

    const exitSelectMode = useCallback(() => {
        setSelectMode(false);
        setSelectedIds(new Set());
    }, []);

    const selectAll = useCallback(() => setSelectedIds(new Set(prints.map((p) => p.id))), [prints]);
    const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

    // ── 削除実行（楽観的更新） ─────────────────────────────────────────────────
    const executeDeletion = useCallback(async (idsToDelete: string[]) => {
        setConfirmState(null);
        setDeleting(true);
        setDeleteError("");

        setPrints((prev) => prev.filter((p) => !idsToDelete.includes(p.id)));
        setSelectedIds(new Set());
        setSelectMode(false);

        try {
            const res = await fetch("/api/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ printIds: idsToDelete }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? "削除に失敗しました");
            }
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "削除に失敗しました");
            await fetchPrints();
        } finally {
            setDeleting(false);
        }
    }, [fetchPrints]);

    const askDelete = useCallback((ids: string[]) => {
        const count = ids.length;
        const isAll = count === prints.length && prints.length > 0;
        setConfirmState({
            title: isAll ? "すべての履歴を削除" : count === 1 ? "この履歴を削除" : `${count}件を削除`,
            message: isAll
                ? `すべての履歴（${count}件）を削除しますか？\nVercel Blob の画像も一緒に削除されます。この操作は取り消せません。`
                : count === 1
                ? "この履歴を削除しますか？この操作は取り消せません。"
                : `選択した ${count} 件を削除しますか？この操作は取り消せません。`,
            confirmLabel: "削除する",
            onConfirm: () => executeDeletion(ids),
        });
    }, [prints.length, executeDeletion]);

    const handleDeleteSingle   = useCallback((id: string) => askDelete([id]), [askDelete]);
    const handleDeleteSelected = useCallback(() => { if (selectedIds.size > 0) askDelete([...selectedIds]); }, [selectedIds, askDelete]);
    const handleDeleteAll      = useCallback(() => { if (prints.length > 0) askDelete(prints.map((p) => p.id)); }, [prints, askDelete]);

    const allSelected = prints.length > 0 && selectedIds.size === prints.length;

    return (
        <>
            {confirmState && <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />}
            {modalUrl && <ImageModal url={modalUrl} onClose={closeModal} />}

            {/* 選択モード時の薄いオーバーレイ */}
            {selectMode && (
                <div className="fixed inset-0 bg-slate-900/5 pointer-events-none z-[5]" />
            )}

            <div className={`min-h-screen transition-colors duration-300 ${selectMode ? "bg-slate-100" : "bg-gradient-to-b from-emerald-50/40 to-slate-50"}`}>

                {/* ─── スティッキーヘッダー ─── */}
                <header className={`sticky top-0 z-10 border-b px-4 h-14 flex items-center transition-colors duration-300 ${
                    selectMode
                        ? "bg-slate-800/95 backdrop-blur-md border-slate-700"
                        : "bg-white/90 backdrop-blur-md border-slate-100"
                }`}>
                    {selectMode ? (
                        /* 選択モードヘッダー */
                        <>
                            <button
                                onClick={exitSelectMode}
                                className="text-sm font-semibold text-slate-300 hover:text-white transition mr-auto"
                            >
                                キャンセル
                            </button>
                            <span className="text-sm font-bold text-white absolute left-1/2 -translate-x-1/2">
                                {selectedIds.size > 0 ? `${selectedIds.size}件選択中` : "選択してください"}
                            </span>
                            <button
                                onClick={allSelected ? deselectAll : selectAll}
                                className="text-sm font-semibold text-emerald-300 hover:text-emerald-200 transition ml-auto"
                            >
                                {allSelected ? "全解除" : "全選択"}
                            </button>
                        </>
                    ) : (
                        /* 通常ヘッダー */
                        <>
                            <Link
                                href="/"
                                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 transition text-slate-600 mr-1"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <h1 className="font-bold text-slate-800 text-base">スキャン履歴</h1>
                            <div className="flex items-center gap-1 ml-auto">
                                {prints.length > 0 && (
                                    <>
                                        <button
                                            onClick={handleDeleteAll}
                                            disabled={deleting}
                                            className="h-9 px-3 text-xs font-semibold text-rose-500 hover:bg-rose-50 rounded-xl transition disabled:opacity-40"
                                        >
                                            全削除
                                        </button>
                                        <button
                                            onClick={enterSelectMode}
                                            className="h-9 px-3 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                                        >
                                            選択
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </header>

                {/* ─── コンテンツ ─── */}
                <div className={`max-w-2xl mx-auto px-4 pt-6 ${selectMode ? "pb-48" : "pb-28"}`}>

                    {/* 削除エラー */}
                    {deleteError && (
                        <div className="mb-4 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-rose-600 text-sm flex items-start gap-2">
                            <span>⚠️</span>
                            <span>{deleteError}</span>
                        </div>
                    )}

                    {/* 削除中インジケータ */}
                    {deleting && (
                        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 text-emerald-700 text-sm flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            削除中...
                        </div>
                    )}

                    {/* ローディング */}
                    {loading && (
                        <div className="flex flex-col items-center gap-3 mt-20 text-emerald-300">
                            <svg className="animate-spin h-9 w-9" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            <p className="text-sm text-slate-400">読み込み中...</p>
                        </div>
                    )}

                    {/* フェッチエラー */}
                    {fetchError && (
                        <div className="mt-8 bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-600 text-sm">
                            {fetchError}
                        </div>
                    )}

                    {/* 空状態 */}
                    {!loading && !fetchError && prints.length === 0 && (
                        <div className="mt-20 flex flex-col items-center gap-4 text-center">
                            <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
                                <span className="text-4xl">📭</span>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-slate-800">履歴がまだありません</p>
                                <p className="text-sm text-slate-500 mt-1">プリントをアップロードすると自動的に保存されます</p>
                            </div>
                            <Link
                                href="/upload"
                                className="mt-2 flex items-center gap-2 h-12 px-6 rounded-2xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition"
                            >
                                <span>📷</span>
                                プリントをスキャン
                            </Link>
                        </div>
                    )}

                    {/* プリントカード一覧 */}
                    <div className="space-y-4">
                        {prints.map((print) => {
                            const isSelected = selectedIds.has(print.id);
                            return (
                                <div
                                    key={print.id}
                                    className={`flex items-stretch gap-3 transition-all duration-150 ${selectMode ? "cursor-pointer" : ""}`}
                                    onClick={selectMode ? () => toggleSelect(print.id) : undefined}
                                >
                                    {/* チェックボックス */}
                                    {selectMode && (
                                        <div
                                            className="flex items-center pl-1 flex-shrink-0"
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(print.id); }}
                                        >
                                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                                                isSelected
                                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                                    : "border-slate-400 bg-white/80"
                                            }`}>
                                                {isSelected && (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* カード本体 */}
                                    <div className={`flex-1 bg-white rounded-2xl overflow-hidden transition-all duration-150 ${
                                        isSelected && selectMode
                                            ? "shadow-md ring-2 ring-emerald-400/60 border border-emerald-200"
                                            : "shadow-sm border border-slate-100"
                                    }`}>
                                        {/* 画像エリア */}
                                        {print.image_url ? (
                                            selectMode ? (
                                                <div className="relative w-full overflow-hidden bg-slate-50">
                                                    <Image
                                                        src={print.image_url}
                                                        alt="プリント画像"
                                                        width={800}
                                                        height={600}
                                                        quality={90}
                                                        className="w-full h-auto object-contain"
                                                        style={{ display: "block" }}
                                                    />
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => openModal(print.image_url)}
                                                    className="relative w-full block overflow-hidden bg-slate-50 active:brightness-95 transition"
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
                                                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                        </svg>
                                                        タップで拡大
                                                    </div>
                                                </button>
                                            )
                                        ) : (
                                            <div className="w-full h-20 bg-emerald-50 flex items-center justify-center text-slate-400 text-sm gap-2">
                                                <span className="text-xl">📄</span>
                                                <span>画像なし</span>
                                            </div>
                                        )}

                                        {/* メタバー */}
                                        <div
                                            className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <p className="text-xs text-slate-400">{formatDate(print.created_at)}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                                    {print.events?.length ?? 0}件の行事
                                                </span>
                                                {!selectMode && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteSingle(print.id); }}
                                                        disabled={deleting}
                                                        className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition disabled:opacity-40"
                                                        aria-label="削除"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 行事リスト */}
                                        <div
                                            className="divide-y divide-slate-50"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {(print.events ?? []).map((ev, idx) => (
                                                <div key={ev.id} className="px-4 py-3.5">
                                                    <div className="flex items-start gap-3">
                                                        <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                                                            {idx + 1}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                <p className="font-semibold text-slate-800 text-sm leading-tight">{ev.title || "不明"}</p>
                                                                {ev.needs_reminder && (
                                                                    <span className="text-xs bg-rose-100 text-rose-600 font-semibold px-2 py-0.5 rounded-full">
                                                                        🔔 要通知
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
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
                                                                    <p className="mt-1.5 text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-amber-50 rounded-xl p-2.5 border border-amber-100">
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
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ─── FAB：新規スキャン ─── */}
            {!selectMode && (
                <Link
                    href="/upload"
                    className="fixed bottom-6 right-6 z-20 w-16 h-16 bg-emerald-500 rounded-full shadow-xl shadow-emerald-300/50 text-2xl flex items-center justify-center text-white hover:bg-emerald-600 active:scale-95 transition"
                    aria-label="新規スキャン"
                >
                    📷
                </Link>
            )}

            {/* ─── 選択モードのボトムアクションバー ─── */}
            <div className={`fixed inset-x-0 bottom-0 z-20 transition-transform duration-300 ease-in-out ${
                selectMode ? "translate-y-0" : "translate-y-full"
            }`}>
                <div className="bg-slate-800 border-t border-slate-700 px-4 pt-3 pb-8 shadow-2xl">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-400">
                                {selectedIds.size > 0
                                    ? `${selectedIds.size}件を選択中`
                                    : "項目を選んでください"}
                            </span>
                            <button
                                onClick={handleDeleteAll}
                                disabled={deleting}
                                className="text-xs text-slate-500 hover:text-slate-300 transition disabled:opacity-40"
                            >
                                全て削除
                            </button>
                        </div>
                        <button
                            onClick={handleDeleteSelected}
                            disabled={selectedIds.size === 0 || deleting}
                            className="w-full h-14 bg-rose-500 text-white font-bold text-base rounded-2xl shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition hover:bg-rose-600 active:scale-[0.98]"
                        >
                            {selectedIds.size > 0
                                ? `🗑️ ${selectedIds.size}件を削除する`
                                : "項目を選択してください"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
