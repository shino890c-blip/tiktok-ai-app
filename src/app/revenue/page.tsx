"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { RevenueTable } from "@/components/revenue/RevenueTable";
import { RevenueFormModal } from "@/components/revenue/RevenueFormModal";
import { MonthlySummaryPanel } from "@/components/revenue/MonthlySummaryPanel";
import { MonthFilterBar } from "@/components/revenue/MonthFilterBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { PlusIcon, InfoIcon } from "@/components/icons";
import { getRevenues } from "@/lib/data/revenues";
import type { Revenue, RevenueFormValues } from "@/components/revenue/types";

function createRevenueId(): string {
  return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function RevenuePage() {
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<Revenue | null>(null);
  const [deletingRevenue, setDeletingRevenue] = useState<Revenue | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRevenues()
      .then((data) => {
        if (!cancelled) setRevenues(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("収益レコードの取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const months = useMemo(() => {
    const set = new Set(revenues.map((revenue) => revenue.recordDate.slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [revenues]);

  const filteredRevenues = useMemo(() => {
    const result =
      selectedMonth === "all"
        ? revenues
        : revenues.filter((revenue) => revenue.recordDate.slice(0, 7) === selectedMonth);
    return [...result].sort((a, b) => b.recordDate.localeCompare(a.recordDate));
  }, [revenues, selectedMonth]);

  const summary = useMemo(() => {
    return filteredRevenues.reduce(
      (acc, revenue) => {
        acc.totalAmount += revenue.amount;
        acc.totalExpense += revenue.expense;
        acc.totalProfit += revenue.amount - revenue.expense;
        return acc;
      },
      { totalAmount: 0, totalExpense: 0, totalProfit: 0 }
    );
  }, [filteredRevenues]);

  const handleAddClick = () => {
    setEditingRevenue(null);
    setFormOpen(true);
  };

  const handleEditClick = (revenue: Revenue) => {
    setEditingRevenue(revenue);
    setFormOpen(true);
  };

  const handleFormSubmit = (values: RevenueFormValues) => {
    if (editingRevenue) {
      setRevenues((prev) =>
        prev.map((revenue) => (revenue.id === editingRevenue.id ? { ...revenue, ...values } : revenue))
      );
      showToast("収益レコードを更新しました");
    } else {
      const newRevenue: Revenue = {
        id: createRevenueId(),
        ...values,
      };
      setRevenues((prev) => [newRevenue, ...prev]);
      showToast("収益レコードを追加しました");
    }
    setFormOpen(false);
    setEditingRevenue(null);
  };

  const handleDeleteConfirm = () => {
    if (!deletingRevenue) return;
    setRevenues((prev) => prev.filter((revenue) => revenue.id !== deletingRevenue.id));
    showToast("収益レコードを削除しました");
    setDeletingRevenue(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">収益管理</h1>
              <p className="text-sm text-[#6B6885] mt-1">
                広告収入・アフィリエイト・スポンサー収益などをまとめて管理します。
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddClick}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-sm font-semibold shadow-md hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              収益レコードを追加
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-[#E8E6F0] bg-[#FFF7ED] p-4">
            <InfoIcon className="w-5 h-5 shrink-0 text-[#D97706]" />
            <p className="text-sm text-[#92400E]">
              本機能は税務ソフトの代替ではありません。正確な会計処理は税理士・会計ソフトをご利用ください。
            </p>
          </div>

          <MonthFilterBar months={months} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />

          <MonthlySummaryPanel
            totalAmount={summary.totalAmount}
            totalExpense={summary.totalExpense}
            totalProfit={summary.totalProfit}
          />

          <p className="text-sm text-[#6B6885]">
            {filteredRevenues.length}件のレコード（全{revenues.length}件）
          </p>

          {loadError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">読み込み中...</p>
            </div>
          ) : (
            <RevenueTable revenues={filteredRevenues} onEdit={handleEditClick} onDelete={setDeletingRevenue} />
          )}
        </div>
      </main>

      <RevenueFormModal
        open={formOpen}
        initialValues={editingRevenue}
        onSubmit={handleFormSubmit}
        onClose={() => {
          setFormOpen(false);
          setEditingRevenue(null);
        }}
      />

      <ConfirmDialog
        open={deletingRevenue !== null}
        title="収益レコードを削除しますか？"
        description="このレコードを削除します。この操作は取り消せません。"
        confirmLabel="削除する"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingRevenue(null)}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
