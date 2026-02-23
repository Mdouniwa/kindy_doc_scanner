import Link from "next/link";

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex flex-col items-center justify-center px-4">
            <div className="text-center max-w-md">
                <p className="text-6xl mb-6">🏫</p>
                <h1 className="text-4xl font-extrabold text-indigo-700 drop-shadow mb-3">
                    幼稚園プリント管理
                </h1>
                <p className="text-gray-500 mb-10 leading-relaxed">
                    プリントを撮影してアップロードするだけで、<br />
                    行事・日付・時間を自動抽出して保存します
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                        href="/upload"
                        className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg shadow-lg hover:from-indigo-700 hover:to-purple-700 transition"
                    >
                        ✨ プリントをスキャン
                    </Link>
                    <Link
                        href="/history"
                        className="px-8 py-4 rounded-2xl bg-white/80 backdrop-blur border border-indigo-100 text-indigo-700 font-bold text-lg shadow hover:bg-white transition"
                    >
                        📚 スキャン履歴
                    </Link>
                </div>
            </div>
        </div>
    );
}
