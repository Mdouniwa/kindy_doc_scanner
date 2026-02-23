import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const { title } = await request.json();
        if (!title) {
            return NextResponse.json({ error: "Title is required" }, { status: 400 });
        }

        const prompt = `幼稚園の行事「${title}」において、保護者が準備すべき一般的な持ち物や注意点を箇条書きで簡潔に教えてください。`;

        const res = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "sonar-pro",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 512,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("Perplexity error:", errText);
            return NextResponse.json({ error: "Perplexity API error" }, { status: 500 });
        }

        const json = await res.json();
        const advice = json?.choices?.[0]?.message?.content?.trim() ?? "";
        return NextResponse.json({ advice });
    } catch (error: unknown) {
        console.error("Perplexity route error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
