"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { AccountTable } from "@/components/accounts/AccountTable";
import { AccountFormModal } from "@/components/accounts/AccountFormModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import { PlusIcon } from "@/components/icons";
import { getAccounts } from "@/lib/data/accounts";
import type { Account, AccountFormValues } from "@/components/accounts/types";

function createAccountId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccounts()
      .then((data) => {
        if (!cancelled) setAccounts(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("アカウント一覧の取得に失敗しました。");
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

  const handleAddClick = () => {
    setEditingAccount(null);
    setFormOpen(true);
  };

  const handleEditClick = (account: Account) => {
    setEditingAccount(account);
    setFormOpen(true);
  };

  const handleFormSubmit = (values: AccountFormValues) => {
    if (editingAccount) {
      setAccounts((prev) =>
        prev.map((account) => (account.id === editingAccount.id ? { ...account, ...values } : account))
      );
      showToast("アカウントを更新しました");
    } else {
      const newAccount: Account = {
        id: createAccountId(),
        ...values,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setAccounts((prev) => [newAccount, ...prev]);
      showToast("アカウントを追加しました");
    }
    setFormOpen(false);
    setEditingAccount(null);
  };

  const handleDeleteConfirm = () => {
    if (!deletingAccount) return;
    setAccounts((prev) => prev.filter((account) => account.id !== deletingAccount.id));
    showToast("アカウントを削除しました");
    setDeletingAccount(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">アカウント管理</h1>
              <p className="text-sm text-[#6B6885] mt-1">
                運用しているSNS・メディアアカウントを一覧で管理します。
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddClick}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-sm font-semibold shadow-md hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              アカウントを追加
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <p className="text-sm text-[#6B6885]">
            登録件数: <span className="font-semibold text-[#2D2B55]">{accounts.length}件</span>
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
            <AccountTable accounts={accounts} onEdit={handleEditClick} onDelete={setDeletingAccount} />
          )}
        </div>
      </main>

      <AccountFormModal
        open={formOpen}
        initialValues={editingAccount}
        onSubmit={handleFormSubmit}
        onClose={() => {
          setFormOpen(false);
          setEditingAccount(null);
        }}
      />

      <ConfirmDialog
        open={deletingAccount !== null}
        title="アカウントを削除しますか？"
        description={`「${deletingAccount?.name ?? ""}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingAccount(null)}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
