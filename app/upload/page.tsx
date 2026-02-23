"use client";
import React, { useState, ChangeEvent, FormEvent, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import ResultCard from "../../components/ResultCard";
import { compressAndConvertImage, MAX_UPLOAD_BYTES, type CompressResult } from "../../lib/imageUtils";

interface EventItem {
    title: string;
    date: string;
    time: string;
    needsReminder: boolean;
    advice: string;
}

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
    const [results, setResults] = useState<EventItem[]>([]);
    const [noEventsFound, setNoEventsFound] = useState(false);
    const [error, setError] = useState<string>("");
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<{ code: string; message: string } | null>(null);
    const [compressResult, setCompressResult] = useState<CompressResult | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0] ?? null;
        setFile(selected);
        setResults([]);
        setNoEventsFound(false);
        setError("");
        setSaved(false);
        setSaveError(null);
        setCompressResult(null);
        if (selected) {
            const url = URL.createObjectURL(selected);
            setPreviewUrl(url);
        } else {
            setPreviewUrl("");
        }
    };

    const clearFile = () => {
        setFile(null);
        setPreviewUrl("");
        setResults([]);
        setNoEventsFound(false);
        setError("");
        setSaved(false);
        setSaveError(null);
        setCompressResult(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!file) return;
        setLoading(true);
        setError("");
        setResults([]);
        setNoEventsFound(false);
        setSaved(false);
        setSaveError(null);
        setCompressResult(null);

        try {
            // ── Step 1: 画像を圧縮・変換 ────────────────────────────────────
            setLoadingStep("📷 画像を最適化中...");
            const compressed = await compressAndConvertImage(file);
            setCompressResult(compressed);

            if (compressed.file.size > MAX_UPLOAD_BYTES) {
                throw new Error(
                    `圧縮後もファイルサイズが ${compressed.compressedSizeMB.toFixed(1)}MB あります。` +
                    `より小さい画像を使用してください（上限 ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB）。`
                );
            }

            // ── Step 2: OCR（失敗してもフォールバックで続行） ──────────────
            setLoadingStep("📖 プリントを読み取り中...");
            let rawEvents: Array<{ title: string; date: string; time: string; needsReminder: boolean }> = [];
            try {
                const ocrForm = new FormData();
                ocrForm.append("file", compressed.file);
                const ocrRes = await fetch("/api/ocr", { method: "POST", body: ocrForm });
                if (ocrRes.ok) {
                    const ocrData = await ocrRes.json();
                    rawEvents = ocrData.events ?? [];
                }
            } catch {
                // ネットワークエラー等 — フォールバックへ
            }

            let enrichedEvents: EventItem[];
            let usedFallback = false;

            if (rawEvents.length === 0) {
                usedFallback = true;
                const scanDate = new Date().toLocaleDateString("ja-JP", {
                    year: "numeric", month: "long", day: "numeric",
                });
                enrichedEvents = [{
                    title: `未分類の書類（${scanDate}スキャン）`,
                    date: "日付不明",
                    time: "",
                    needsReminder: false,
                    advice: "",
                }];
            } else {
                // ── Step 3: Perplexity アドバイス ───────────────────────────
                setLoadingStep(`🔍 ${rawEvents.length}件の行事のアドバイスを取得中...`);
                enrichedEvents = await Promise.all(
                    rawEvents.map(async (ev) => {
                        try {
                            const perplexityRes = await fetch("/api/perplexity", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ title: ev.title }),
                            });
                            if (!perplexityRes.ok) return { ...ev, advice: "" };
                            const adviceData = await perplexityRes.json();
                            return { ...ev, advice: adviceData.advice ?? "" };
                        } catch {
                            return { ...ev, advice: "" };
                        }
                    })
                );
            }

            setNoEventsFound(usedFallback);
            if (!usedFallback) setResults(enrichedEvents);

            // ── Step 4: 保存 ─────────────────────────────────────────────
            setLoadingStep("💾 データを保存中...");
            try {
                const saveFormData = new FormData();
                saveFormData.append("file", compressed.file);
                saveFormData.append("events", JSON.stringify(enrichedEvents));
                const saveRes = await fetch("/api/save", { method: "POST", body: saveFormData });
                if (saveRes.ok) {
                    setSaved(true);
                } else {
                    const saveBody = await saveRes.json().catch(() => ({}));
                    const code: string = saveBody.code ?? "UNKNOWN";
                    const message: string =
                        code === "RLS_ERROR"
                            ? "Supabase の RLS ポリシーが原因で保存できませんでした。"
                        : code === "BLOB_TOKEN_MISSING"
                            ? "Vercel Blob のトークンが未設定です。"
                        : code === "BLOB_UPLOAD_FAILED"
                            ? `画像のアップロードに失敗しました。${saveBody.detail ?? ""}`
                        : code === "ENV_MISSING"
                            ? saveBody.error ?? "環境変数が正しく設定されていません。"
                            : saveBody.error ?? "保存に失敗しました";
                    setSaveError({ code, message });
                }
            } catch {
                setSaveError({ code: "NETWORK_ERROR", message: "保存リクエストが失敗しました（ネットワークエラー）" });
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "エラーが発生しました");
        } finally {
            setLoading(false);
            setLoadingStep("");
        }
    };

    const isImage = file && (file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif"));

    return (
        <form onSubmit={handleSubmit} className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex flex-col">

            {/* ─── スティッキーヘッダー ─── */}
            <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 h-14 flex items-center justify-between">
                <Link
                    href="/"
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition text-gray-600"
                    aria-label="戻る"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </Link>
                <h1 className="font-bold text-gray-900 text-base">プリントをスキャン</h1>
                <Link
                    href="/history"
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-orange-50 active:bg-orange-100 transition text-orange-500"
                    aria-label="履歴"
                >
                    <span className="text-lg">📚</span>
                </Link>
            </header>

            {/* ─── スクロール可能なコンテンツ ─── */}
            <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-6 pb-36">

                {/* ── 写真選択エリア ── */}
                {!file ? (
                    <label className="block cursor-pointer">
                        <div className="w-full aspect-[4/3] bg-orange-50 border-2 border-dashed border-orange-200 rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-orange-100 active:bg-orange-100 transition">
                            <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center">
                                <span className="text-3xl">📷</span>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-orange-600 text-base">タップして写真を選択</p>
                                <p className="text-xs text-gray-400 mt-1">JPG・PNG・HEIC（iPhone）に対応</p>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </label>
                ) : (
                    /* 選択済み：プレビュー表示 */
                    <div className="relative rounded-2xl overflow-hidden bg-gray-100 shadow-sm">
                        {isImage ? (
                            <Image
                                src={previewUrl}
                                alt="プレビュー"
                                width={600}
                                height={400}
                                className="w-full h-auto object-contain max-h-72"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-24 bg-orange-50 text-gray-500 text-sm gap-2">
                                <span className="text-2xl">📄</span>
                                <span>PDFが選択されました</span>
                            </div>
                        )}
                        {/* 閉じるボタン */}
                        {!loading && (
                            <button
                                type="button"
                                onClick={clearFile}
                                className="absolute top-2.5 right-2.5 w-8 h-8 bg-black/50 backdrop-blur-sm text-white rounded-full flex items-center justify-center text-sm hover:bg-black/70 transition"
                                aria-label="写真を変更"
                            >
                                ✕
                            </button>
                        )}
                        {/* ファイル名バッジ */}
                        {!loading && (
                            <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                                <span className="bg-black/50 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full max-w-[160px] truncate">
                                    {file.name}
                                </span>
                                {(file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) && (
                                    <span className="bg-orange-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full">
                                        HEIC→JPEG
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── 圧縮情報バッジ ── */}
                {compressResult && !loading && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-medium px-3 py-1.5 rounded-full">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {compressResult.originalSizeMB.toFixed(1)}MB → {compressResult.compressedSizeMB.toFixed(1)}MB
                        </div>
                        {compressResult.wasConverted && (
                            <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-full">
                                HEIC→JPEG変換済み
                            </span>
                        )}
                        {compressResult.wasResized && (
                            <span className="bg-purple-50 border border-purple-200 text-purple-600 text-xs font-medium px-3 py-1.5 rounded-full">
                                最大2000pxにリサイズ
                            </span>
                        )}
                    </div>
                )}

                {/* ── エラーメッセージ ── */}
                {error && (
                    <div className="mt-4 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3.5 flex items-start gap-3">
                        <span className="flex-shrink-0 text-rose-500 mt-0.5">⚠️</span>
                        <p className="text-sm text-rose-700 whitespace-pre-line leading-relaxed">{error}</p>
                    </div>
                )}

                {/* ── 行事情報なしの保存完了 ── */}
                {noEventsFound && !loading && (
                    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-5 py-4">
                            <div className="flex items-start gap-3.5">
                                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <span className="text-xl">📷</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">画像を保存しました</h3>
                                    <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                                        詳細情報は見つかりませんでしたが、画像は履歴に保存されました。
                                        明るい場所での再撮影をお試しください。
                                    </p>
                                </div>
                            </div>
                            {saved && (
                                <div className="mt-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700">
                                    <span>✅</span>
                                    <span className="font-medium">履歴に保存されました</span>
                                    <Link href="/history" className="ml-auto text-green-600 underline underline-offset-2 text-xs font-semibold">
                                        履歴を見る →
                                    </Link>
                                </div>
                            )}
                            {saveError && (
                                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700">
                                    ⚠️ {saveError.message}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── 行事抽出結果 ── */}
                {results.length > 0 && (
                    <div className="mt-6">
                        {/* 保存ステータス */}
                        {saved && (
                            <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700 font-medium">
                                <span>✅</span>
                                <span>履歴に保存されました</span>
                                <Link href="/history" className="ml-auto text-green-600 underline underline-offset-2 text-xs font-semibold">
                                    履歴を見る →
                                </Link>
                            </div>
                        )}
                        {saveError && (
                            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                                <div className="flex items-start gap-3 px-4 py-3">
                                    <span className="text-xl flex-shrink-0">⚠️</span>
                                    <div>
                                        <p className="text-sm font-semibold text-amber-800">保存エラー</p>
                                        <p className="text-sm text-amber-700 mt-0.5">{saveError.message}</p>
                                        {saveError.code === "RLS_ERROR" && (
                                            <details className="mt-2">
                                                <summary className="text-xs text-amber-600 font-semibold cursor-pointer">修正方法を見る</summary>
                                                <p className="mt-1 text-xs font-mono bg-amber-100 rounded-lg p-2 text-amber-800 leading-relaxed">
                                                    {"CREATE POLICY \"service_role_insert_prints\"\n  ON prints FOR INSERT TO service_role WITH CHECK (true);"}
                                                </p>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2 mb-4">
                            <h2 className="text-lg font-bold text-gray-900">抽出結果</h2>
                            <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-full">
                                {results.length}件の行事
                            </span>
                        </div>

                        <div className="space-y-4">
                            {results.map((item, index) => (
                                <ResultCard
                                    key={index}
                                    index={index + 1}
                                    total={results.length}
                                    title={item.title}
                                    date={item.date}
                                    time={item.time}
                                    needsReminder={item.needsReminder}
                                    advice={item.advice}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* ─── 固定ボトムバー（スキャンCTA） ─── */}
            <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/90 backdrop-blur-md border-t border-gray-100 px-4 py-4">
                <div className="max-w-lg mx-auto space-y-2">
                    {/* 写真変更リンク（選択済みの場合のみ） */}
                    {file && !loading && (
                        <div className="flex justify-center">
                            <label className="text-sm text-orange-500 font-semibold cursor-pointer hover:text-orange-600 transition">
                                別の写真を選ぶ
                                <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    )}

                    {/* メインCTAボタン */}
                    <button
                        type="submit"
                        disabled={loading || !file}
                        className="w-full h-14 rounded-2xl bg-orange-500 text-white font-bold text-base shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                <span>{loadingStep}</span>
                            </>
                        ) : !file ? (
                            <>
                                <span className="text-lg">📷</span>
                                <span>写真を選んでください</span>
                            </>
                        ) : (
                            <>
                                <span className="text-lg">✨</span>
                                <span>スキャン開始</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
}
