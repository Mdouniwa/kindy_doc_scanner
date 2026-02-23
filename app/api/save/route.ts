import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import type { PostgrestError } from "@supabase/supabase-js";
import { createServerClient } from "../../../lib/supabase";

interface EventPayload {
    title: string;
    date: string;
    time: string;
    needsReminder: boolean;
    advice: string;
}

// ─── ログユーティリティ ────────────────────────────────────────────────────────

const TAG = "[/api/save]";

function log(...args: unknown[]) {
    console.log(TAG, ...args);
}

function err(...args: unknown[]) {
    console.error(TAG, ...args);
}

function dumpError(label: string, e: unknown): void {
    if (e === null || e === undefined) {
        err(`${label}: null / undefined`);
        return;
    }
    if (typeof e !== "object") {
        err(`${label}:`, e);
        return;
    }
    const obj: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(e)) {
        obj[key] = (e as Record<string, unknown>)[key];
    }
    const known = {
        message: (e as Record<string, unknown>).message,
        code: (e as Record<string, unknown>).code,
        details: (e as Record<string, unknown>).details,
        hint: (e as Record<string, unknown>).hint,
        status: (e as Record<string, unknown>).status,
    };
    err(`${label} — known:`, JSON.stringify(known, null, 2));
    err(`${label} — all props:`, JSON.stringify(obj, null, 2));
}

function isRlsError(e: PostgrestError): boolean {
    return (
        e.code === "42501" ||
        e.message.toLowerCase().includes("policy") ||
        e.message.toLowerCase().includes("permission denied")
    );
}

// ─── ルートハンドラ ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const reqId = Date.now().toString(36);
    log(`===== POST 開始 reqId=${reqId} =====`);

    // ── 0. 環境変数チェック ──────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    log(`env NEXT_PUBLIC_SUPABASE_URL : ${supabaseUrl ? `"${supabaseUrl.slice(0, 40)}..."` : "❌ 未設定"}`);
    log(`env SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey ? `set (長さ ${serviceRoleKey.length})` : "❌ 未設定"}`);
    log(`env BLOB_READ_WRITE_TOKEN    : ${blobToken ? `set (長さ ${blobToken.length})` : "❌ 未設定"}`);

    if (!supabaseUrl || supabaseUrl.startsWith("your_") || supabaseUrl.startsWith("hhttps")) {
        err("NEXT_PUBLIC_SUPABASE_URL が不正です:", supabaseUrl);
        return NextResponse.json(
            { error: "Supabase URL が正しく設定されていません（hhttps:// などのタイポがないか確認）", code: "ENV_MISSING" },
            { status: 500 }
        );
    }
    if (!serviceRoleKey || serviceRoleKey.startsWith("your_")) {
        err("SUPABASE_SERVICE_ROLE_KEY が未設定または placeholder です");
        return NextResponse.json(
            { error: "Supabase サービスロールキーが設定されていません", code: "ENV_MISSING" },
            { status: 500 }
        );
    }
    if (!blobToken || blobToken.startsWith("your_")) {
        err("BLOB_READ_WRITE_TOKEN が未設定または placeholder です");
        return NextResponse.json(
            {
                error: "Vercel Blob トークンが設定されていません。Vercel ダッシュボード → Storage → Blob → Connect to project で BLOB_READ_WRITE_TOKEN を取得してください。",
                code: "BLOB_TOKEN_MISSING",
            },
            { status: 500 }
        );
    }

    try {
        // ── 1. FormData パース ────────────────────────────────────────────────
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const eventsJson = formData.get("events") as string | null;

        log(`file: name="${file?.name ?? "なし"}" size=${file?.size ?? 0} bytes type="${file?.type ?? "なし"}"`);
        log(`eventsJson length: ${eventsJson?.length ?? 0} chars`);
        log(`eventsJson (先頭300文字): ${eventsJson?.slice(0, 300)}`);

        if (!eventsJson) {
            err("events フィールドが FormData に含まれていません");
            return NextResponse.json({ error: "Events data required", code: "MISSING_EVENTS" }, { status: 400 });
        }

        // ── 2. JSON パース ───────────────────────────────────────────────────
        let events: EventPayload[];
        try {
            events = JSON.parse(eventsJson);
            log(`JSON パース成功: ${events.length} 件`);
        } catch (parseErr) {
            err("eventsJson の JSON パースに失敗:", parseErr);
            return NextResponse.json({ error: "Invalid events JSON", code: "PARSE_ERROR" }, { status: 400 });
        }

        if (!Array.isArray(events) || events.length === 0) {
            err("events が空または配列でありません:", events);
            return NextResponse.json({ error: "Events array is empty", code: "EMPTY_EVENTS" }, { status: 400 });
        }

        events.forEach((ev, i) => {
            log(`  events[${i}]: title="${ev.title}" date="${ev.date}" time="${ev.time}" needsReminder=${ev.needsReminder} advice長さ=${ev.advice?.length ?? 0}`);
        });

        // ── 3. Supabase クライアント生成 ─────────────────────────────────────
        let supabase: ReturnType<typeof createServerClient>;
        try {
            supabase = createServerClient();
            log("Supabase クライアント生成 OK");
        } catch (clientErr) {
            err("Supabase クライアント生成中に例外が発生:");
            dumpError("createServerClient()", clientErr);
            return NextResponse.json({ error: "Supabase クライアント生成エラー", code: "CLIENT_ERROR" }, { status: 500 });
        }

        // ── 4. Vercel Blob への画像アップロード ──────────────────────────────
        //
        //  ファイルが存在する場合、アップロードは必須とする。
        //  失敗した場合は DB 登録も行わず、エラーを返す。
        //  （空 URL のまま prints テーブルに登録されるのを防ぐ）
        //
        let imageUrl = "";

        if (file && file.size > 0) {
            log(`Vercel Blob アップロード開始: ${file.name} (${file.size} bytes) type="${file.type}"`);

            try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // 拡張子と MIME タイプを JPEG に正規化（compress 済みのはずだが念のため）
                const ext = file.name.toLowerCase().endsWith(".jpg") ? "jpg"
                    : file.name.split(".").pop() ?? "jpg";
                const contentType = file.type.startsWith("image/") ? file.type : "image/jpeg";

                // Blob のパス名（ランダム文字列でファイル名衝突を防ぐ）
                const blobPath = `prints/${reqId}-${Math.random().toString(36).slice(2)}.${ext}`;
                log(`Blob path: "${blobPath}"  contentType: "${contentType}"  bufferSize: ${buffer.length} bytes`);

                // @vercel/blob v2 は BLOB_READ_WRITE_TOKEN 環境変数を自動参照する。
                // 明示的に token を渡すことで .env での動作も保証する。
                const blob = await put(blobPath, buffer, {
                    access: "public",
                    contentType,
                    token: blobToken,
                });

                imageUrl = blob.url;
                log(`✅ Vercel Blob アップロード成功`);
                log(`   url        : ${imageUrl}`);
                log(`   contentType: ${blob.contentType}`);
            } catch (blobErr) {
                err("❌ Vercel Blob アップロード失敗:");
                dumpError("blobError", blobErr);
                // 画像があるのにアップロード失敗した場合は全体をエラーにして DB 保存もしない
                return NextResponse.json(
                    {
                        error: "画像のアップロードに失敗しました。BLOB_READ_WRITE_TOKEN を確認してください。",
                        code: "BLOB_UPLOAD_FAILED",
                        detail: blobErr instanceof Error ? blobErr.message : String(blobErr),
                    },
                    { status: 500 }
                );
            }
        } else {
            log("ファイルなし or サイズ0 — Blob アップロードをスキップ");
        }

        // ── 5. prints テーブル INSERT ────────────────────────────────────────
        //  imageUrl が空文字の場合は file が渡されなかったケース。
        //  file があるのに imageUrl が空なら上のステップでエラーになっているため、ここには到達しない。
        const printInsertData = { image_url: imageUrl };
        log("prints INSERT 送信データ:", JSON.stringify(printInsertData));

        const { data: print, error: printError } = await supabase
            .from("prints")
            .insert(printInsertData)
            .select("id")
            .single();

        if (printError) {
            err("❌ prints テーブル INSERT 失敗:");
            dumpError("printError", printError);
            if (isRlsError(printError)) {
                return NextResponse.json(
                    { error: "RLS ポリシーにより prints テーブルへの書き込みが拒否されました", code: "RLS_ERROR" },
                    { status: 403 }
                );
            }
            return NextResponse.json(
                { error: "prints テーブルへの保存に失敗しました", code: "DB_ERROR" },
                { status: 500 }
            );
        }

        log("✅ prints INSERT 成功 id:", print.id);

        // ── 6. events テーブル INSERT ────────────────────────────────────────
        const eventRows = events.map((ev) => ({
            print_id: print.id,
            title: ev.title ?? "",
            date: ev.date ?? "",
            time: ev.time ?? "",
            needs_reminder: ev.needsReminder ?? false,
            advice: ev.advice ?? "",
        }));

        log(`events INSERT 送信データ (${eventRows.length}件):`);
        eventRows.forEach((row, i) => log(`  row[${i}]:`, JSON.stringify(row)));

        const { data: eventsData, error: eventsError } = await supabase
            .from("events")
            .insert(eventRows)
            .select("id");

        if (eventsError) {
            err("❌ events テーブル INSERT 失敗:");
            dumpError("eventsError", eventsError);
            err("失敗時の eventRows:", JSON.stringify(eventRows, null, 2));

            // ロールバック: prints レコードを削除
            log("ロールバック開始 — prints id:", print.id, "を削除します");
            const { error: rollbackError } = await supabase.from("prints").delete().eq("id", print.id);
            if (rollbackError) {
                err("⚠️ ロールバック失敗 (prints id", print.id, "が残存):");
                dumpError("rollbackError", rollbackError);
            } else {
                log("ロールバック成功 — prints id:", print.id, "を削除しました");
            }

            if (isRlsError(eventsError)) {
                return NextResponse.json(
                    {
                        error: "RLS ポリシーにより events テーブルへの書き込みが拒否されました。Supabase の INSERT ポリシーを確認してください。",
                        code: "RLS_ERROR",
                    },
                    { status: 403 }
                );
            }
            return NextResponse.json(
                {
                    error: "events テーブルへの保存に失敗しました",
                    code: "DB_ERROR",
                    detail: eventsError.message,
                },
                { status: 500 }
            );
        }

        log(`✅ events INSERT 成功 (${eventsData?.length ?? eventRows.length}件)`);
        log(`===== POST 完了 reqId=${reqId} =====`);

        return NextResponse.json({
            success: true,
            printId: print.id,
            eventCount: eventsData?.length ?? eventRows.length,
            imageUrl,
        });
    } catch (error: unknown) {
        err("===== 予期しない例外が発生 =====");
        dumpError("unhandledError", error);
        err(`===== reqId=${reqId} =====`);
        return NextResponse.json({ error: "Internal server error", code: "UNKNOWN" }, { status: 500 });
    }
}
