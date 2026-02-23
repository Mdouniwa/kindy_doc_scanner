import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { createServerClient } from "../../../lib/supabase";

const TAG = "[/api/delete]";
const log = (...a: unknown[]) => console.log(TAG, ...a);
const err = (...a: unknown[]) => console.error(TAG, ...a);

export async function DELETE(request: Request) {
    const reqId = Date.now().toString(36);
    log(`===== DELETE 開始 reqId=${reqId} =====`);

    try {
        const body = await request.json().catch(() => ({}));
        const printIds: string[] = body.printIds ?? [];

        if (!Array.isArray(printIds) || printIds.length === 0) {
            return NextResponse.json(
                { error: "printIds は空でない配列を指定してください", code: "INVALID_IDS" },
                { status: 400 }
            );
        }
        log(`対象 printIds (${printIds.length}件):`, printIds);

        const supabase = createServerClient();

        // ── 1. 削除対象の image_url を Supabase から取得 ─────────────────────
        const { data: printRows, error: fetchError } = await supabase
            .from("prints")
            .select("id, image_url")
            .in("id", printIds);

        if (fetchError) {
            err("prints 取得失敗:", fetchError.message);
            return NextResponse.json(
                { error: "削除対象の取得に失敗しました", code: "FETCH_ERROR", detail: fetchError.message },
                { status: 500 }
            );
        }

        log(`取得した prints: ${printRows?.length ?? 0}件`);

        // ── 2. Vercel Blob の画像を削除 ──────────────────────────────────────
        const blobUrls = (printRows ?? [])
            .map((p) => p.image_url as string)
            .filter((url) => typeof url === "string" && url.includes("blob.vercel-storage.com"));

        if (blobUrls.length > 0) {
            log(`Vercel Blob 削除対象: ${blobUrls.length}件`);
            try {
                const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
                await del(blobUrls, { token: blobToken });
                log("✅ Vercel Blob 削除完了");
            } catch (blobErr) {
                // Blob 削除に失敗しても DB 削除は続行する（孤立レコードより孤立ファイルの方がマシ）
                err("⚠️ Vercel Blob 削除に一部失敗（DB 削除は続行）:", blobErr instanceof Error ? blobErr.message : String(blobErr));
            }
        } else {
            log("Blob URL なし — Vercel Blob 削除をスキップ");
        }

        // ── 3. events テーブルを先に削除（FK cascade が未設定の環境向け） ──
        const { error: eventsDelError } = await supabase
            .from("events")
            .delete()
            .in("print_id", printIds);

        if (eventsDelError) {
            err("events 削除失敗:", eventsDelError.message);
            return NextResponse.json(
                { error: "events の削除に失敗しました", code: "EVENTS_DEL_ERROR", detail: eventsDelError.message },
                { status: 500 }
            );
        }
        log("✅ events 削除完了");

        // ── 4. prints テーブルを削除 ─────────────────────────────────────────
        const { error: printsDelError } = await supabase
            .from("prints")
            .delete()
            .in("id", printIds);

        if (printsDelError) {
            err("prints 削除失敗:", printsDelError.message);
            return NextResponse.json(
                { error: "prints の削除に失敗しました", code: "PRINTS_DEL_ERROR", detail: printsDelError.message },
                { status: 500 }
            );
        }
        log(`✅ prints 削除完了 (${printIds.length}件)`);
        log(`===== DELETE 完了 reqId=${reqId} =====`);

        return NextResponse.json({ success: true, deletedCount: printIds.length });
    } catch (error: unknown) {
        err("予期しない例外:", error instanceof Error ? error.message : String(error));
        return NextResponse.json(
            { error: "Internal server error", code: "UNKNOWN" },
            { status: 500 }
        );
    }
}
