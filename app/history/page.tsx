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
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5">
                    <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
                    <p className="mt-2 text-sm text-gray-500 leading-relaxed">{message}</p>
                </div>
                <div className="flex border-t border-gray-100">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition"
                    >
                        キャンセル
                    </button>
                    <div className="w-px bg-gray-100" />
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 transition"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 画像拡大モーダル ─────────────────────────────────────────────────────────

interface ImageModalProps {
    url: string;
    onClose: () => void;
}

function ImageModal({ url, onClose }: ImageModalProps) {
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
                <p className="text-white/50 text-xs leading-snug">
                    {zoomed ? "スクロールして確認 / タップで縮小" : "タップで拡大 / ピンチでズーム"}
                </p>
                <button
                    onClick={onClose}
                    className="ml-4 flex-shrink-0 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 transition flex items-center justify-center text-white text-base font-bold"
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

    // 選択・削除ステート
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

    const openModal = useCallback((url: string) => setModalUrl(url), []);
    const closeModal = useCallback(() => setModalUrl(null), []);

    // ── データ取得 ──────────────────────────────────────────────────────────────
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

    // ── 選択操作 ────────────────────────────────────────────────────────────────
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

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(prints.map((p) => p.id)));
    }, [prints]);

    const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

    // ── 削除実行（楽観的更新） ───────────────────────────────────────────────────
    const executeDeletion = useCallback(async (idsToDelete: string[]) => {
        setConfirmState(null);
        setDeleting(true);
        setDeleteError("");

        // 楽観的更新：即座に UI から消す
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
            const msg = e instanceof Error ? e.message : "削除に失敗しました";
            setDeleteError(msg);
            // 楽観的更新を元に戻すため再取得
            await fetchPrints();
        } finally {
            setDeleting(false);
        }
    }, [fetchPrints]);

    // ── 確認ダイアログを経由する削除ヘルパー ────────────────────────────────────
    const askDelete = useCallback((ids: string[]) => {
        const count = ids.length;
        const isAll = count === prints.length && prints.length > 0;
        setConfirmState({
            title: isAll ? "すべて削除" : count === 1 ? "プリントを削除" : `${count}件を削除`,
            message: isAll
                ? `すべての履歴（${count}件）を削除しますか？この操作は取り消せません。`
                : count === 1
                ? "このプリントを削除しますか？この操作は取り消せません。"
                : `選択した ${count} 件のプリントを削除しますか？この操作は取り消せません。`,
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
            {/* 確認ダイアログ */}
            {confirmState && (
                <ConfirmDialog {...confirmState} onCancel={() => setConfirmState(null)} />
            )}

            {/* 画像拡大モーダル */}
            {modalUrl && <ImageModal url={modalUrl} onClose={closeModal} />}

            <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex flex-col items-center py-10 px-4">

                {/* ─── ヘッダー ─── */}
                <header className="mb-6 w-full max-w-2xl">
                    {selectMode ? (
                        /* 選択モード ヘッダー */
                        <>
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={exitSelectMode}
                                    className="px-3 py-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition"
                                >
                                    キャンセル
                                </button>
                                <span className="text-sm font-semibold text-gray-700">
                                    {selectedIds.size > 0 ? `${selectedIds.size}件を選択中` : "選択してください"}
                                </span>
                                <button
                                    onClick={handleDeleteSelected}
                                    disabled={selectedIds.size === 0 || deleting}
                                    className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    削除
                                </button>
                            </div>
                            {/* 全選択・全削除サブバー */}
                            <div className="mt-2 flex items-center gap-3 px-1">
                                <button
                                    onClick={allSelected ? deselectAll : selectAll}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                                >
                                    {allSelected ? "全て解除" : "全て選択"}
                                </button>
                                <span className="text-gray-300 text-xs">|</span>
                                <button
                                    onClick={handleDeleteAll}
                                    disabled={deleting}
                                    className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-40 transition"
                                >
                                    全て削除
                                </button>
                            </div>
                        </>
                    ) : (
                        /* 通常モード ヘッダー */
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-3xl font-extrabold text-indigo-700 drop-shadow">📚 スキャン履歴</h1>
                                    <p className="mt-1 text-gray-500 text-sm">保存済みのプリント一覧です</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {prints.length > 0 && (
                                        <button
                                            onClick={enterSelectMode}
                                            className="px-3 py-2 text-sm font-semibold text-gray-600 bg-white/70 border border-gray-200 rounded-xl hover:bg-white shadow-sm transition"
                                        >
                                            選択
                                        </button>
                                    )}
                                    <Link
                                        href="/upload"
                                        className="flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:bg-indigo-700 transition"
                                    >
                                        ＋ 新規
                                    </Link>
                                </div>
                            </div>
                            {/* 全削除ボタン（通常モード） */}
                            {prints.length > 0 && (
                                <div className="mt-3 flex justify-end">
                                    <button
                                        onClick={handleDeleteAll}
                                        disabled={deleting}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-40 transition"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        全て削除
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </header>

                {/* 削除エラー */}
                {deleteError && (
                    <div className="mb-4 w-full max-w-2xl bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex items-start gap-2">
                        <span className="flex-shrink-0">⚠️</span>
                        <span>{deleteError}</span>
                    </div>
                )}

                {/* 削除中オーバーレイ */}
                {deleting && (
                    <div className="mb-4 w-full max-w-2xl bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 text-indigo-600 text-sm flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        削除中...
                    </div>
                )}

                {/* ローディング */}
                {loading && (
                    <div className="flex flex-col items-center gap-3 mt-16 text-indigo-400">
                        <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        <p className="text-sm">読み込み中...</p>
                    </div>
                )}

                {/* フェッチエラー */}
                {fetchError && (
                    <div className="mt-8 w-full max-w-2xl bg-red-50 border border-red-200 rounded-2xl p-5 text-red-600 text-sm">
                        {fetchError}
                    </div>
                )}

                {/* 空状態 */}
                {!loading && !fetchError && prints.length === 0 && (
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

                {/* プリントカード一覧 */}
                <div className="w-full max-w-2xl space-y-4">
                    {prints.map((print) => {
                        const isSelected = selectedIds.has(print.id);
                        return (
                            <div
                                key={print.id}
                                className={`flex items-stretch gap-3 transition-all duration-150 ${selectMode ? "cursor-pointer" : ""}`}
                                onClick={selectMode ? () => toggleSelect(print.id) : undefined}
                            >
                                {/* チェックボックス列（選択モード時のみ） */}
                                {selectMode && (
                                    <div
                                        className="flex items-center pl-1 flex-shrink-0"
                                        onClick={(e) => { e.stopPropagation(); toggleSelect(print.id); }}
                                    >
                                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
                                            isSelected
                                                ? "bg-indigo-600 border-indigo-600 text-white"
                                                : "border-gray-300 bg-white"
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
                                <div className={`flex-1 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border overflow-hidden transition-all duration-150 ${
                                    isSelected && selectMode
                                        ? "border-indigo-400 ring-2 ring-indigo-300/60"
                                        : "border-indigo-100"
                                }`}>
                                    {/* 画像エリア */}
                                    {print.image_url ? (
                                        selectMode ? (
                                            /* 選択モード：画像はモーダルを開かない */
                                            <div className="relative w-full overflow-hidden bg-gray-50">
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
                                            /* 通常モード：タップでモーダル表示 */
                                            <button
                                                type="button"
                                                onClick={() => openModal(print.image_url)}
                                                className="relative w-full block overflow-hidden bg-gray-50 active:brightness-95 transition"
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
                                                <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow">
                                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                    </svg>
                                                    タップで拡大
                                                </div>
                                            </button>
                                        )
                                    ) : (
                                        <div className="w-full h-24 bg-indigo-50 flex items-center justify-center text-gray-400 text-sm gap-2">
                                            <span className="text-2xl">📄</span>
                                            <span>画像なし</span>
                                        </div>
                                    )}

                                    {/* メタ情報バー */}
                                    <div
                                        className="flex items-center justify-between px-4 py-3 border-b border-indigo-50"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <p className="text-xs text-gray-400">{formatDate(print.created_at)}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-indigo-100 text-indigo-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                                                {print.events?.length ?? 0}件の行事
                                            </span>
                                            {/* 個別削除ボタン（通常モードのみ） */}
                                            {!selectMode && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSingle(print.id); }}
                                                    disabled={deleting}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                                                    aria-label="この履歴を削除"
                                                    title="削除"
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
                                        className="divide-y divide-indigo-50"
                                        onClick={(e) => e.stopPropagation()}
                                    >
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
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
