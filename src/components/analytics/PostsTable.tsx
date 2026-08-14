"use client";

import type { Post } from "./types";

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

interface PostsTableProps {
  posts: Post[];
}

export function PostsTable({ posts }: PostsTableProps) {
  return (
    <section aria-labelledby="posts-table-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <h2 id="posts-table-title" className="text-lg font-bold text-[#2D2B55] mb-4">投稿実績一覧</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-[#6B6885] border-b border-[#E8E6F0]">
              <th className="py-2 pr-4">投稿日</th>
              <th className="py-2 pr-4">投稿タイトル</th>
              <th className="py-2 pr-4">アカウント</th>
              <th className="py-2 pr-4 text-right">再生数</th>
              <th className="py-2 pr-4 text-right">いいね</th>
              <th className="py-2 pr-4 text-right">コメント</th>
              <th className="py-2 pr-4 text-right">シェア</th>
              <th className="py-2 text-right">保存数</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[#6B6885]">
                  該当する投稿実績がありません
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="border-b border-[#F1F0F4] hover:bg-[#F8F7FA] transition-colors">
                  <td className="py-2.5 pr-4 text-[#6B6885] whitespace-nowrap">
                    {new Date(post.postedAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="py-2.5 pr-4 text-[#2D2B55] font-medium">{post.ideaTitle}</td>
                  <td className="py-2.5 pr-4 text-[#6B6885] whitespace-nowrap">{post.accountName}</td>
                  <td className="py-2.5 pr-4 text-right text-[#2D2B55] font-semibold">{formatNumber(post.views)}</td>
                  <td className="py-2.5 pr-4 text-right text-[#6B6885]">{formatNumber(post.likes)}</td>
                  <td className="py-2.5 pr-4 text-right text-[#6B6885]">{formatNumber(post.comments)}</td>
                  <td className="py-2.5 pr-4 text-right text-[#6B6885]">{formatNumber(post.shares)}</td>
                  <td className="py-2.5 text-right text-[#6B6885]">{formatNumber(post.saves)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
