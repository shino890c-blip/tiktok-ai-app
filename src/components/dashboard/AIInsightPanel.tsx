"use client";

import { motion } from "framer-motion";
import { SparkleIcon, AIIcon } from "@/components/icons";

const hourlyData = [
  { hour: "0時", value: 15 },
  { hour: "6時", value: 25 },
  { hour: "12時", value: 40 },
  { hour: "18時", value: 90 },
  { hour: "24時", value: 35 },
];

const keywords = ["#腸活", "#コスパ最強", "#AI活用", "#自炊記録", "#モーニングルーティン"];

export function AIInsightPanel() {
  return (
    <aside aria-labelledby="ai-title" className="space-y-5">
      <div className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <SparkleIcon className="w-5 h-5 text-[#7C3AED]" />
          <h2 id="ai-title" className="text-lg font-bold text-[#2D2B55]">AIおすすめ（今日の提案）</h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-[#F8F7FA] rounded-lg p-4 mb-4"
        >
          <h3 className="text-sm font-bold text-[#2D2B55] mb-2">ショート動画の伸びしろ予測</h3>
          <p className="text-sm text-[#6B6885] mb-3">過去データから、今日投稿すると伸びやすい時間帯は<strong className="text-[#7C3AED]">20:00〜22:00</strong>です。</p>

          <div className="flex items-end gap-2 h-20">
            {hourlyData.map((item, index) => (
              <div key={item.hour} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md transition-all duration-500 ${
                    item.value >= 80 ? "bg-[#7C3AED]" : "bg-[#E8E6F0]"
                  }`}
                  style={{ height: `${item.value}%` }}
                />
                <span className="text-[10px] text-[#6B6885]">{item.hour}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-4"
        >
          <h3 className="text-sm font-bold text-[#2D2B55] mb-2">トレンドキーワード</h3>
          <p className="text-xs text-[#6B6885] mb-3">今週急上昇中のキーワードを台本に取り入れましょう。</p>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-block px-3 py-1 bg-[#F3F0FF] text-[#7C3AED] text-xs font-medium rounded-full"
              >
                {keyword}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-[#FFF7ED] rounded-lg p-4"
        >
          <h3 className="text-sm font-bold text-[#2D2B55] mb-2">収益改善のヒント</h3>
          <p className="text-sm text-[#6B6885]">過去の人気動画に共通する要素：テンポの良いカット、BGMの使用、冒頭3秒のフックが効果的です。</p>
        </motion.div>
      </div>

      <div className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AIIcon className="w-5 h-5 text-[#7C3AED]" />
          <h2 className="text-lg font-bold text-[#2D2B55]">AIワークフロー</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { id: "candidates", label: "候補提示" },
            { id: "script", label: "台本作成" },
            { id: "daily", label: "当日まとめ" },
            { id: "weekly", label: "週次分析" },
          ].map((item, index) => (
            <motion.button
              key={item.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-3 bg-[#F8F7FA] hover:bg-[#F3F0FF] text-[#2D2B55] hover:text-[#7C3AED] text-sm font-semibold rounded-lg border border-[#E8E6F0] hover:border-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
            >
              {item.label}
            </motion.button>
          ))}
        </div>

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-lg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
        >
          <SparkleIcon className="w-4 h-4" />
          AIに台本の改善案を依頼
        </motion.button>
      </div>
    </aside>
  );
}
