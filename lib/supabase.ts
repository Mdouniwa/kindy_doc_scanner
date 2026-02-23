import { createClient } from "@supabase/supabase-js";

/** API ルート（サーバーサイド）用 — サービスロールキーで RLS をバイパス */
export function createServerClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

/** クライアントコンポーネント（history ページ等）用 — anon キーで読み取り */
export function createBrowserClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
