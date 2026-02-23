import OpenAI from "openai";
import { NextResponse } from "next/server";

const TAG = "[/api/ocr]";

/** ファイルサイズ上限 (OpenAI の画像 URL 経由の base64 は ~20MB が実質限界) */
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(request: Request) {
    const reqId = Date.now().toString(36);
    console.log(`${TAG} ===== POST 開始 reqId=${reqId} =====`);

    try {
        // ── 1. FormData パース ────────────────────────────────────────────────
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch (fdErr) {
            console.error(`${TAG} FormData パース失敗:`, fdErr);
            return NextResponse.json(
                { error: "リクエストの解析に失敗しました", code: "FORM_PARSE_ERROR" },
                { status: 400 }
            );
        }

        const file = formData.get("file") as File | null;

        // ── 2. ファイルの存在・内容チェック ──────────────────────────────────
        if (!file) {
            console.error(`${TAG} ❌ file フィールドが FormData に含まれていません`);
            return NextResponse.json(
                { error: "ファイルが添付されていません", code: "NO_FILE" },
                { status: 400 }
            );
        }

        console.log(
            `${TAG} 受信ファイル: name="${file.name}" size=${file.size} bytes ` +
            `(${(file.size / 1024 / 1024).toFixed(2)} MB) type="${file.type}"`
        );

        if (file.size === 0) {
            console.error(`${TAG} ❌ ファイルサイズが 0 バイトです`);
            return NextResponse.json(
                { error: "空のファイルが送信されました", code: "EMPTY_FILE" },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_BYTES) {
            console.error(
                `${TAG} ❌ ファイルサイズ超過: ${file.size} bytes > ` +
                `${MAX_FILE_BYTES} bytes (${MAX_FILE_BYTES / 1024 / 1024}MB 上限)`
            );
            return NextResponse.json(
                {
                    error: `ファイルサイズが上限（${MAX_FILE_BYTES / 1024 / 1024}MB）を超えています。` +
                           `フロントエンドで圧縮してから送信してください。`,
                    code: "FILE_TOO_LARGE",
                },
                { status: 413 }
            );
        }

        // ── 3. 画像を Base64 に変換 ───────────────────────────────────────────
        let base64: string;
        try {
            const arrayBuffer = await file.arrayBuffer();
            base64 = Buffer.from(arrayBuffer).toString("base64");
        } catch (convertErr) {
            console.error(`${TAG} Base64 変換失敗:`, convertErr);
            return NextResponse.json(
                { error: "画像データの変換に失敗しました", code: "CONVERT_ERROR" },
                { status: 500 }
            );
        }

        // MIME タイプの正規化（HEIC が万一届いた場合も image/jpeg として扱う）
        let mimeType = file.type || "image/jpeg";
        if (mimeType === "image/heic" || mimeType === "image/heif") {
            console.warn(`${TAG} HEIC ファイルが届きました（フロントの変換が機能しなかった可能性）— image/jpeg として処理します`);
            mimeType = "image/jpeg";
        }

        console.log(
            `${TAG} Base64 変換完了: ${base64.length} chars (${(base64.length / 1024).toFixed(0)} KB) ` +
            `mimeType="${mimeType}"`
        );

        // ── 4. OpenAI API 呼び出し ────────────────────────────────────────────
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error(`${TAG} ❌ OPENAI_API_KEY が設定されていません`);
            return NextResponse.json(
                { error: "OpenAI API キーが設定されていません", code: "NO_API_KEY" },
                { status: 500 }
            );
        }

        console.log(`${TAG} OpenAI API 呼び出し開始 (model: gpt-4o)`);
        const openai = new OpenAI({ apiKey });

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: `data:${mimeType};base64,${base64}` },
                        },
                        {
                            type: "text",
                            text: `この幼稚園のプリント画像に含まれるすべての行事・提出物・イベントを抽出し、それぞれについて以下の情報をJSON配列で返してください。
- title: 行事名や提出物名（string）
- date: 日付（string、例: "2026年3月10日"。不明な場合は空文字）
- time: 開始時間や時間帯（string、例: "10:00〜11:30"、"午前10時"。不明な場合は空文字）
- needsReminder: 事前準備や通知が必要な重要イベントかどうか（boolean）
1枚のプリントに複数の行事が含まれる場合は、すべてをevents配列に含めてください。`,
                        },
                    ],
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "events_extraction",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            events: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        date: { type: "string" },
                                        time: { type: "string" },
                                        needsReminder: { type: "boolean" },
                                    },
                                    required: ["title", "date", "time", "needsReminder"],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ["events"],
                        additionalProperties: false,
                    },
                },
            },
        });

        const content = response.choices[0].message.content ?? '{"events":[]}';
        console.log(`${TAG} OpenAI レスポンス受信: ${content.length} chars`);

        const data = JSON.parse(content);
        const eventCount = Array.isArray(data.events) ? data.events.length : 0;
        console.log(`${TAG} ✅ 抽出完了: ${eventCount}件の行事`);
        console.log(`${TAG} ===== POST 完了 reqId=${reqId} =====`);

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error(`${TAG} ===== 予期しないエラー reqId=${reqId} =====`);
        console.error(`${TAG}`, error);
        return NextResponse.json(
            { error: "OCR処理中にエラーが発生しました", code: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
