/**
 * ブラウザ側（クライアントサイドのみ）で動作する画像最適化ユーティリティ。
 * - HEIC / HEIF → JPEG 変換（heic2any 使用）
 * - Canvas API による長辺リサイズ（最大 MAX_LONG_SIDE px）
 * - JPEG 圧縮（JPEG_QUALITY）
 * - アップロードサイズ上限チェック
 */

/** 長辺の最大ピクセル数 */
const MAX_LONG_SIDE = 1200;

/** JPEG 圧縮品質（0〜1） */
const JPEG_QUALITY = 0.82;

/** アップロード上限（バイト）— Vercel Blob / Supabase Storage の安全マージンを考慮 */
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // 4.5 MB

export interface CompressResult {
    /** 処理後のファイル */
    file: File;
    /** 元のサイズ（MB） */
    originalSizeMB: number;
    /** 圧縮後のサイズ（MB） */
    compressedSizeMB: number;
    /** HEIC → JPEG 変換が行われたか */
    wasConverted: boolean;
    /** リサイズが行われたか */
    wasResized: boolean;
}

/** HEIC / HEIF ファイルかどうかを判定する */
function isHeicFile(file: File): boolean {
    const lc = file.name.toLowerCase();
    return (
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        lc.endsWith(".heic") ||
        lc.endsWith(".heif")
    );
}

/**
 * 画像ファイルを圧縮・変換して最適化済み File を返す。
 * PDF はそのまま返す（変換しない）。
 *
 * @throws HEIC 変換失敗・Canvas 失敗・createImageBitmap 失敗 などの場合
 */
export async function compressAndConvertImage(rawFile: File): Promise<CompressResult> {
    const originalSizeMB = rawFile.size / 1024 / 1024;

    // PDF はそのまま通す
    if (rawFile.type === "application/pdf" || rawFile.name.toLowerCase().endsWith(".pdf")) {
        return {
            file: rawFile,
            originalSizeMB,
            compressedSizeMB: originalSizeMB,
            wasConverted: false,
            wasResized: false,
        };
    }

    let processedFile: File = rawFile;
    let wasConverted = false;

    // ── Step 1: HEIC / HEIF → JPEG 変換 ─────────────────────────────────────
    if (isHeicFile(rawFile)) {
        try {
            // heic2any は Browser-only のためダイナミックインポート
            const heic2any = (await import("heic2any")).default;
            const result = await heic2any({
                blob: rawFile,
                toType: "image/jpeg",
                quality: 0.9, // Canvas 圧縮の前段なので高品質で変換
            });
            const jpegBlob = Array.isArray(result) ? result[0] : result;
            const baseName = rawFile.name.replace(/\.(heic|heif)$/i, "");
            processedFile = new File([jpegBlob], `${baseName}.jpg`, {
                type: "image/jpeg",
            });
            wasConverted = true;
            console.log(
                `[imageUtils] HEIC→JPEG 変換完了: ${(jpegBlob.size / 1024 / 1024).toFixed(2)} MB`
            );
        } catch (heicErr) {
            console.warn("[imageUtils] heic2any 変換失敗、Canvas でのデコードを試みます:", heicErr);
            // ブラウザが HEIC をネイティブデコードできる場合（Safari 等）は後続処理で対応
        }
    }

    // ── Step 2: Canvas でリサイズ & JPEG 圧縮 ────────────────────────────────
    if (processedFile.type.startsWith("image/")) {
        let bitmap: ImageBitmap;
        try {
            bitmap = await createImageBitmap(processedFile);
        } catch {
            // createImageBitmap が失敗 = ブラウザがこのフォーマットを解釈できない
            if (isHeicFile(rawFile) && !wasConverted) {
                throw new Error(
                    "HEIC形式の画像を変換できませんでした。\n" +
                    "iPhoneの場合：設定 → カメラ → フォーマット → 「互換性優先」にすると\n" +
                    "JPEGで撮影できるようになります。"
                );
            }
            throw new Error("画像の読み込みに失敗しました。別の画像ファイルを使用してください。");
        }

        let { width, height } = bitmap;
        const wasResized = width > MAX_LONG_SIDE || height > MAX_LONG_SIDE;

        if (wasResized) {
            if (width >= height) {
                height = Math.round(height * (MAX_LONG_SIDE / width));
                width = MAX_LONG_SIDE;
            } else {
                width = Math.round(width * (MAX_LONG_SIDE / height));
                height = MAX_LONG_SIDE;
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            bitmap.close();
            throw new Error("Canvas 2D コンテキストを取得できませんでした。");
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const compressedBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) =>
                    b
                        ? resolve(b)
                        : reject(new Error("canvas.toBlob が null を返しました。")),
                "image/jpeg",
                JPEG_QUALITY
            );
        });

        const baseName = processedFile.name.replace(/\.[^.]+$/, "");
        const compressedFile = new File([compressedBlob], `${baseName}.jpg`, {
            type: "image/jpeg",
        });

        console.log(
            `[imageUtils] 圧縮完了: ${originalSizeMB.toFixed(2)}MB → ` +
            `${(compressedFile.size / 1024 / 1024).toFixed(2)}MB ` +
            `(${width}×${height}px, JPEG ${Math.round(JPEG_QUALITY * 100)}%)`
        );

        return {
            file: compressedFile,
            originalSizeMB,
            compressedSizeMB: compressedFile.size / 1024 / 1024,
            wasConverted: wasConverted || isHeicFile(rawFile),
            wasResized,
        };
    }

    // 画像以外（変換不要なファイル）はそのまま返す
    return {
        file: processedFile,
        originalSizeMB,
        compressedSizeMB: processedFile.size / 1024 / 1024,
        wasConverted,
        wasResized: false,
    };
}
