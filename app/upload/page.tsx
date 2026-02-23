"use client";
import React, { useState, ChangeEvent, FormEvent } from "react";
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
            // ── Step 1: 画像を圧縮・変換 ──────────────────────────────────────
            setLoadingStep("📷 画像を最適化中...");
            const compressed = await compressAndConvertImage(file);
            setCompressResult(compressed);

            // アップロードサイズ上限チェック
            if (compressed.file.size > MAX_UPLOAD_BYTES) {
                throw new Error(
                    `圧縮後もファイルサイズが ${compressed.compressedSizeMB.toFixed(1)}MB あります。` +
                    `より小さい画像を使用してください（上限 ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB）。`
                );
            }

            // ── Step 2: OCR（失敗してもフォールバックで続行）─────────────────
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

            // OCR で行事が取得できなかった場合はフォールバックイベントを設定
            let enrichedEvents: EventItem[];
            let usedFallback = false;

            if (rawEvents.length === 0) {
                usedFallback = true;
                const scanDate = new Date().toLocaleDateString("ja-JP", {
                    year: "numeric", month: "long", day: "numeric",
                });
                const fallback: EventItem = {
                    title: `未分類の書類（${scanDate}スキャン）`,
                    date: "日付不明",
                    time: "",
                    needsReminder: false,
                    advice: "",
                };
                enrichedEvents = [fallback];
            } else {
                // ── Step 3: Perplexity アドバイスを各行事に対して並列取得 ─────
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

            // フォールバック時は results を空に保ち、専用UIで案内する
            setNoEventsFound(usedFallback);
            if (!usedFallback) setResults(enrichedEvents);

            // ── Step 4: Supabase に自動保存（フォールバック含む）────────────
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
                            ? "Supabase の RLS（行レベルセキュリティ）ポリシーが原因で保存できませんでした。events テーブルへの INSERT ポリシーを設定してください。"
                        : code === "BLOB_TOKEN_MISSING"
                            ? "Vercel Blob のトークンが未設定です。Vercel ダッシュボード → Storage → Blob で BLOB_READ_WRITE_TOKEN を設定してください。"
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex flex-col items-center py-10 px-4">
            <header className="mb-8 w-full max-w-lg flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-indigo-700 drop-shadow">🏫 幼稚園プリント管理</h1>
                    <p className="mt-1 text-gray-500 text-sm">プリントをアップロードして行事情報を自動抽出します</p>
                </div>
                <Link
                    href="/history"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/70 border border-indigo-100 text-indigo-600 text-sm font-semibold shadow-sm hover:bg-white transition"
                >
                    📚 履歴
                </Link>
            </header>

            <form
                onSubmit={handleSubmit}
                className="w-full max-w-lg bg-white/80 backdrop-blur-md rounded-2xl shadow-xl p-6 border border-indigo-100"
            >
                <label className="block text-sm font-semibold text-gray-600 mb-1" htmlFor="fileInput">
                    プリント画像を選択
                </label>
                <p className="text-xs text-gray-400 mb-3">
                    JPG / PNG / HEIC（iPhone撮影） / PDF に対応。送信前に自動で圧縮されます。
                </p>
                <input
                    id="fileInput"
                    type="file"
                    accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-5 file:rounded-full file:border-0
                        file:text-sm file:font-semibold file:bg-indigo-600 file:text-white
                        hover:file:bg-indigo-700 transition mb-4 cursor-pointer"
                />

                {/* 選択ファイルのサイズ情報 */}
                {file && !loading && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
                        <span>📎 {file.name}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        {(file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) && (
                            <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                                HEIC → JPEGに自動変換
                            </span>
                        )}
                    </div>
                )}

                {previewUrl && (
                    <div className="mb-4 rounded-xl overflow-hidden border border-indigo-100 shadow-sm">
                        {file?.type.startsWith("image/") ||
                        file?.name.toLowerCase().endsWith(".heic") ||
                        file?.name.toLowerCase().endsWith(".heif") ? (
                            <Image
                                src={previewUrl}
                                alt="プレビュー"
                                width={480}
                                height={320}
                                className="w-full object-contain max-h-64"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-24 bg-indigo-50 text-gray-500 text-sm">
                                📄 PDFが選択されました
                            </div>
                        )}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || !file}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow
                        hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? loadingStep : "✨ 送信してデータ抽出"}
                </button>

                {error && (
                    <p className="mt-3 text-sm text-red-500 text-center whitespace-pre-line">{error}</p>
                )}
            </form>

            {/* 圧縮結果バッジ */}
            {compressResult && !loading && (
                <div className="mt-4 w-full max-w-lg flex flex-wrap items-center gap-2 px-4 py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-700">
                    <span className="font-semibold">📦 画像最適化</span>
                    <span className="bg-sky-100 px-2 py-0.5 rounded-full">
                        {compressResult.originalSizeMB.toFixed(1)}MB
                        {" → "}
                        <span className="font-bold text-sky-800">{compressResult.compressedSizeMB.toFixed(1)}MB</span>
                    </span>
                    {compressResult.wasConverted && (
                        <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                            HEIC→JPEG変換済み
                        </span>
                    )}
                    {compressResult.wasResized && (
                        <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                            長辺2000pxにリサイズ済み
                        </span>
                    )}
                </div>
            )}

            {/* OCR で行事情報が見つからなかった場合（画像のみ保存） */}
            {noEventsFound && !loading && (
                <div className="w-full max-w-lg mt-6">
                    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-indigo-100 overflow-hidden">
                        <div className="p-5">
                            <div className="flex items-start gap-4">
                                <span className="text-3xl flex-shrink-0">📷</span>
                                <div>
                                    <h3 className="font-bold text-gray-800 text-lg">画像を保存しました</h3>
                                    <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                                        詳細情報は見つかりませんでしたが、画像は履歴に保存されました。<br />
                                        手書きや低解像度の場合は、より明るい場所で再撮影してみてください。
                                    </p>
                                </div>
                            </div>
                            {saved && (
                                <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                                    <span>✅</span>
                                    <span>履歴に保存されました</span>
                                    <Link href="/history" className="ml-auto text-green-600 underline underline-offset-2 hover:text-green-800 text-xs">
                                        履歴を見る →
                                    </Link>
                                </div>
                            )}
                            {saveError && (
                                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
                                    ⚠️ {saveError.message}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {results.length > 0 && (
                <div className="w-full max-w-lg mt-6">
                    {/* 保存ステータス */}
                    {saved && (
                        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
                            <span>✅</span>
                            <span>履歴に保存されました</span>
                            <Link href="/history" className="ml-auto text-green-600 underline underline-offset-2 hover:text-green-800 text-xs">
                                履歴を見る →
                            </Link>
                        </div>
                    )}
                    {saveError && (
                        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
                            <div className="flex items-start gap-3 px-4 py-3">
                                <span className="text-xl flex-shrink-0 mt-0.5">⚠️</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-yellow-800">
                                        {saveError.code === "RLS_ERROR" ? "Supabase RLS エラー" : "保存エラー"}
                                    </p>
                                    <p className="text-sm text-yellow-700 mt-0.5">{saveError.message}</p>
                                    {saveError.code === "RLS_ERROR" && (
                                        <details className="mt-2">
                                            <summary className="text-xs text-yellow-600 font-semibold cursor-pointer hover:text-yellow-800">
                                                修正方法を見る
                                            </summary>
                                            <div className="mt-2 text-xs text-yellow-700 bg-yellow-100 rounded-lg p-3 space-y-1 font-mono leading-relaxed">
                                                <p className="font-sans font-semibold text-yellow-800 mb-1">Supabase SQL Editor で以下を実行してください：</p>
                                                <p>{"CREATE POLICY \"service_role_insert_prints\""}</p>
                                                <p>{"  ON prints FOR INSERT TO service_role WITH CHECK (true);"}</p>
                                                <p className="mt-1">{"CREATE POLICY \"service_role_insert_events\""}</p>
                                                <p>{"  ON events FOR INSERT TO service_role WITH CHECK (true);"}</p>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-2xl font-bold text-indigo-700">📋 抽出結果</h2>
                        <span className="bg-indigo-100 text-indigo-600 text-sm font-semibold px-3 py-0.5 rounded-full">
                            {results.length}件
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
        </div>
    );
}
