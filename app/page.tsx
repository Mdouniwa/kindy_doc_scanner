import Link from "next/link";

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50/40 flex flex-col items-center justify-center px-6">
            <div className="text-center max-w-sm w-full">
                {/* App icon */}
                <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-orange-400 to-amber-400 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-200">
                    <span className="text-5xl">📋</span>
                </div>

                <h1 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">
                    プリント管理
                </h1>
                <p className="text-gray-500 text-sm leading-relaxed mb-12">
                    幼稚園のプリントを撮影するだけで<br />
                    行事・日程を自動で保存します
                </p>

                <div className="space-y-3">
                    <Link
                        href="/upload"
                        className="flex items-center justify-center gap-2.5 w-full h-14 rounded-2xl bg-orange-500 text-white font-bold text-base shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-[0.98] transition"
                    >
                        <span className="text-xl">📷</span>
                        プリントをスキャン
                    </Link>
                    <Link
                        href="/history"
                        className="flex items-center justify-center gap-2.5 w-full h-14 rounded-2xl bg-white text-gray-700 font-semibold text-base shadow-sm border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition"
                    >
                        <span className="text-xl">📚</span>
                        スキャン履歴を見る
                    </Link>
                </div>

                <p className="mt-12 text-xs text-gray-400">
                    AI が行事・日付・時間を自動抽出します
                </p>
            </div>
        </div>
    );
}
