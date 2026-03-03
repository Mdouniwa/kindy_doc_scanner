import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    headers: async () => [
        {
            source: "/sw.js",
            headers: [
                {
                    key: "Cache-Control",
                    value: "no-cache, no-store, must-revalidate",
                },
                {
                    key: "Service-Worker-Allowed",
                    value: "/",
                },
            ],
        },
    ],
    images: {
        remotePatterns: [
            // Vercel Blob — put() が返す URL のホスト
            // 例: https://abc123.public.blob.vercel-storage.com/prints/xxx.jpg
            {
                protocol: "https",
                hostname: "*.public.blob.vercel-storage.com",
            },
            // サブドメインなしの Blob URL にも対応
            {
                protocol: "https",
                hostname: "public.blob.vercel-storage.com",
            },
            // Supabase Storage（念のため残しておく）
            {
                protocol: "https",
                hostname: "*.supabase.co",
            },
        ],
    },
};

export default nextConfig;
