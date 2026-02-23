import { NextResponse } from "next/server";
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

/**
 * Supabase のエラーオブジェクトは独自クラスのため JSON.stringify({...spread}) では
 * 列挙不可プロパティが落ちる。Object.getOwnPropertyNames で全プロパティを強制取得する。
 */
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

    // さらに Supabase PostgREST エラーの既知フィールドを明示
    const known = {
        message: (e as Record<string, unknown>).message,
        code: (e as Record<string, unknown>).code,
        details: (e as Record<string, unknown>).details,
        hint: (e as Record<string, unknown>).hint,
        status: (e as Record<string, unknown>).status,
        statusText: (e as Record<string, unknown>).statusText,
    };

    err(`${label} — known fields:`, JSON.stringify(known, null, 2));
    err(`${label} — all own properties:`, JSON.stringify(obj, null, 2));
    err(`${label} — raw toString:`, String(e));
}

/** RLS 違反エラーかどうか判定する（PostgrestError を直接受け取る） */
function isRlsError(e: PostgrestError): boolean {
    return (
        e.code === "42501" ||
        e.message.toLowerCase().includes("policy") ||
        e.message.toLowerCase().includes("permission denied")
    );
}

// ─── ルートハンドラ ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const reqId = Date.now().toString(36); // リクエスト追跡用 ID
    log(`===== POST 開始 reqId=${reqId} =====`);

    // ── 0. 環境変数チェック ──────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    log(`env NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? `"${supabaseUrl.slice(0, 30)}..."` : "❌ 未設定"}`);
    log(`env SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey ? `"${serviceRoleKey.slice(0, 10)}..."（長さ ${serviceRoleKey.length}）` : "❌ 未設定"}`);

    if (!supabaseUrl || supabaseUrl.startsWith("your_")) {
        err("NEXT_PUBLIC_SUPABASE_URL が未設定または placeholder のままです");
        return NextResponse.json(
            { error: "Supabase URL が設定されていません", code: "ENV_MISSING" },
            { status: 500 }
        );
    }
    if (!serviceRoleKey || serviceRoleKey.startsWith("your_")) {
        err("SUPABASE_SERVICE_ROLE_KEY が未設定または placeholder のままです");
        return NextResponse.json(
            { error: "Supabase サービスロールキーが設定されていません", code: "ENV_MISSING" },
            { status: 500 }
        );
    }

    try {
        // ── 1. FormData パース ────────────────────────────────────────────────
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const eventsJson = formData.get("events") as string | null;

        log(`file: name="${file?.name ?? "なし"}" size=${file?.size ?? 0} bytes`);
        log(`eventsJson length: ${eventsJson?.length ?? 0} chars`);
        log(`eventsJson (先頭200文字): ${eventsJson?.slice(0, 200)}`);

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

        if (!Array.isArray(events)) {
            err("パース結果が配列ではありません:", typeof events, events);
            return NextResponse.json({ error: "Events must be an array", code: "NOT_ARRAY" }, { status: 400 });
        }
        if (events.length === 0) {
            err("events が空配列です");
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

        // ── 4. Storage 画像アップロード ──────────────────────────────────────
        let imageUrl = "";
        if (file && file.size > 0) {
            log(`Storage アップロード開始: ${file.name} (${file.size} bytes)`);
            try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const ext = file.name.split(".").pop() ?? "jpg";
                const fileName = `${reqId}-${Math.random().toString(36).slice(2)}.${ext}`;
                log(`Storage ファイル名: ${fileName}`);

                const { data: storageData, error: storageError } = await supabase.storage
                    .from("prints")
                    .upload(fileName, buffer, { contentType: file.type || "image/jpeg", upsert: false });

                if (storageError) {
                    err("Storage アップロード失敗（スキップして継続）:");
                    dumpError("storageError", storageError);
                } else {
                    const { data: urlData } = supabase.storage.from("prints").getPublicUrl(storageData.path);
                    imageUrl = urlData.publicUrl;
                    log("Storage アップロード成功 publicUrl:", imageUrl);
                }
            } catch (storageException) {
                err("Storage アップロード中に例外（スキップして継続）:");
                dumpError("storageException", storageException);
            }
        } else {
            log("ファイルなし or サイズ0 — Storage アップロードをスキップ");
        }

        // ── 5. prints テーブル INSERT ────────────────────────────────────────
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

            // ロールバック
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

        log(`✅ events INSERT 成功 (${eventsData?.length ?? eventRows.length}件) ids:`, eventsData?.map((r) => r.id));
        log(`===== POST 完了 reqId=${reqId} =====`);

        return NextResponse.json({
            success: true,
            printId: print.id,
            eventCount: eventsData?.length ?? eventRows.length,
        });
    } catch (error: unknown) {
        err("===== 予期しない例外が発生 =====");
        dumpError("unhandledError", error);
        err(`===== reqId=${reqId} =====`);
        return NextResponse.json({ error: "Internal server error", code: "UNKNOWN" }, { status: 500 });
    }
}
