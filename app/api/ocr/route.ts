import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = file.type || "image/jpeg";

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        const data = JSON.parse(content);
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("OCR error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
