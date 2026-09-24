import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminWindow } from './components/AdminWindow';
import { AppHeader } from './components/AppHeader';
import { AccountsPanel } from './components/AccountsPanel';
import { BarsChart } from './components/BarsChart';
import { Board } from './components/Board';
import { Budgets } from './components/Budgets';
import { DonutChart } from './components/DonutChart';
import { ImportWindow } from './components/ImportWindow';
import { JarsPanel } from './components/JarsPanel';
import { KpiSummary } from './components/KpiSummary';
import { MovementWindow } from './components/MovementWindow';
import { ErrorState, LoadingState } from './components/States';
import { Notice } from './components/Notice';
import { ConfirmWindow } from './components/Window';
import { SheetPin } from './components/SheetPin';
import { useAnnounce } from './components/LiveRegion';
import { useAuth } from './auth/AuthContext';
import { api, readableError } from './api/client';
import {
  useAccounts,
  useBudgets,
  useByCategory,
  useCategories,
  useCreateAccount,
  useCreateMovement,
  useDeleteAccount,
  useDeleteBudget,
  useDeleteMovement,
  useImportData,
  useMonthly,
  useMovements,
  usePlan,
  useSetBudget,
  useSummary,
  useUpdateAccount,
  useUpdateMovement,
} from './api/queries';
import type {
  Account,
  AccountFilter,
  AccountInput,
  AccountUpdateInput,
  ImportMode,
  Movement,
  MovementInput,
} from './api/types';
import { formatMoney } from './lib/money';
import { currentMonthKey, formatDateDisplay, isValidMonthKey, monthFullLabel, shiftMonth, todayStr } from './lib/month';

interface Banner {
  kind: 'success' | 'error';
  text: string;
}

/** What a confirmation window is asking about, if any. */
type PendingConfirm =
  | { kind: 'movement'; movement: Movement }
  | { kind: 'account'; account: Account };

/** Límite de la API para el cuerpo del import (5 MB): se valida acá para dar un error claro. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function App() {
  const announce = useAnnounce();
  const { logout } = useAuth();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [account, setAccount] = useState<AccountFilter>('all');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<Movement | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [importing, setImporting] = useState(false);
  const [repaintKey, setRepaintKey] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const movementsQuery = useMovements(month, account);
  const summaryQuery = useSummary(month, account);
  const byCategoryQuery = useByCategory(month, account);
  const monthlyQuery = useMonthly(month, 6, account);
  const budgetsQuery = useBudgets(month);
  const planQuery = usePlan(month);

  const createMovement = useCreateMovement();
  const updateMovement = useUpdateMovement();
  const deleteMovement = useDeleteMovement();
  const setBudget = useSetBudget();
  const deleteBudget = useDeleteBudget();
  const importData = useImportData();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  useEffect(() => {
    setFilter('all');
    setEditing(null);
  }, [month, account]);

  const categories = categoriesQuery.data ?? [];
  const accounts = useMemo(() => accountsQuery.data?.items ?? [], [accountsQuery.data]);
  const totalDebtCents = accountsQuery.data?.total_debt_cents ?? 0;
  const labelOf = useCallback(
    (id: string) => categories.find((category) => category.id === id)?.label ?? id,
    [categories],
  );
  const accountNameOf = useCallback(
    (movement: Movement) =>
      movement.account_name ?? accounts.find((item) => item.id === movement.account_id)?.name ?? '',
    [accounts],
  );

  // Prefill the VES rate field with the last rate the user entered, read from
  // the most recent Bs movement already loaded for the month.
  const lastVesRateMicros = useMemo(() => {
    const ves = (movementsQuery.data ?? []).find(
      (movement) => movement.entry_currency === 'VES' && movement.rate_micros,
    );
    return ves?.rate_micros ?? null;
  }, [movementsQuery.data]);

  /**
   * Announce a short message that includes the NEW balance, read from the API
   * (the summary refetch), never recomputed on the client. Falls back to the
   * bare message if the refetch fails, so a successful mutation is still voiced.
   */
  async function announceWithBalance(prefix: string) {
    try {
      const result = await summaryQuery.refetch();
      const balance = result.data?.balance_cents;
      if (typeof balance === 'number') {
        announce(`${prefix} Te queda ${formatMoney(balance, 'USD')}.`);
        return;
      }
    } catch {
      // The mutation already succeeded; keep the plain message.
    }
    announce(prefix);
  }

  function goToMonth(next: string) {
    if (next === month) return;
    setMonth(next);
    setBanner(null);
    setRepaintKey((key) => key + 1);
    setFlashId(null);
    announce(`Mes ${monthFullLabel(next)}.`);
  }

  /** Jump straight to a month typed in the header field; empty/invalid keys
   * are ignored (validated with the month helpers, never by hand). */
  function handleMonthChange(next: string) {
    if (!isValidMonthKey(next)) return;
    goToMonth(next);
  }

  /** Open the movement window: prefilled for an edit, blank for a new movement. */
  function openMovementWindow(movement: Movement | null) {
    setBanner(null);
    setEditing(movement);
    setMovementOpen(true);
    if (movement) announce('Editando movimiento.');
  }

  function closeMovementWindow() {
    setMovementOpen(false);
    setEditing(null);
  }

  async function handleSubmit(input: MovementInput, current: Movement | null) {
    try {
      if (current) {
        const updated = await updateMovement.mutateAsync({ id: current.id, patch: input });
        setEditing(null);
        setMovementOpen(false);
        setRepaintKey((key) => key + 1);
        setFlashId(updated.id);
        void announceWithBalance('Movimiento actualizado.');
      } else {
        const created = await createMovement.mutateAsync(input);
        setMovementOpen(false);
        setRepaintKey((key) => key + 1);
        setFlashId(created.id);
        void announceWithBalance('Movimiento agregado.');
      }
    } catch (error) {
      announce(readableError(error));
      throw error;
    }
  }

  function handleDelete(movement: Movement) {
    setBanner(null);
    setPendingConfirm({ kind: 'movement', movement });
  }

  async function confirmDeleteMovement() {
    if (pendingConfirm?.kind !== 'movement') return;
    const { movement } = pendingConfirm;
    try {
      await deleteMovement.mutateAsync(movement.id);
      if (editing?.id === movement.id) closeMovementWindow();
      setRepaintKey((key) => key + 1);
      setFlashId(movement.id);
      setPendingConfirm(null);
      void announceWithBalance('Movimiento borrado.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
      setPendingConfirm(null);
    }
  }

  async function handleSetBudget(categoryId: string, capCents: number) {
    try {
      await setBudget.mutateAsync({ categoryId, capCents });
      void announceWithBalance('Presupuesto actualizado.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
    }
  }

  async function handleClearBudget(categoryId: string) {
    try {
      await deleteBudget.mutateAsync(categoryId);
      void announceWithBalance('Presupuesto borrado.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
    }
  }

  async function handleCreateAccount(input: AccountInput) {
    try {
      await createAccount.mutateAsync(input);
      announce('Cartera creada.');
    } catch (error) {
      announce(readableError(error));
      throw error;
    }
  }

  async function handleUpdateAccount(id: number, patch: AccountUpdateInput) {
    try {
      await updateAccount.mutateAsync({ id, patch });
      announce('Cartera actualizada.');
    } catch (error) {
      announce(readableError(error));
      throw error;
    }
  }

  function handleDeleteAccount(accountToDelete: Account) {
    setBanner(null);
    setPendingConfirm({ kind: 'account', account: accountToDelete });
  }

  async function confirmDeleteAccount() {
    if (pendingConfirm?.kind !== 'account') return;
    const { account: accountToDelete } = pendingConfirm;
    try {
      await deleteAccount.mutateAsync(accountToDelete.id);
      setPendingConfirm(null);
      announce('Cartera borrada.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
      setPendingConfirm(null);
    }
  }

  function cancelConfirm() {
    if (pendingConfirm?.kind === 'account') announce('Borrado cancelado.');
    setPendingConfirm(null);
  }

  async function handlePayDebt(input: MovementInput) {
    try {
      await createMovement.mutateAsync(input);
      void announceWithBalance('Pago de deuda registrado.');
    } catch (error) {
      announce(readableError(error));
      throw error;
    }
  }

  function changeAccount(next: AccountFilter) {
    setAccount(next);
    setBanner(null);
    if (next === 'all') {
      announce('Mostrando todas las carteras.');
      return;
    }
    const name = accounts.find((item) => item.id === next)?.name ?? 'la cartera';
    announce(`Filtrando por ${name}.`);
  }

  async function handleExport() {
    try {
      const text = await api.exportData();
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `financirdus-${todayStr()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce('Archivo JSON exportado.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
    }
  }

  async function handleImport(file: File, mode: ImportMode) {
    setImporting(true);
    setBanner(null);
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error('El archivo es demasiado grande (máximo 5 MB).');
      }
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('El archivo no es un JSON válido.');
      }

      const result = await importData.mutateAsync({ mode, payload });
      setBanner({
        kind: 'success',
        text: `Datos ${mode === 'replace' ? 'reemplazados' : 'fusionados'}: ${result.movements_imported} movimientos y ${result.budgets_imported} presupuestos.`,
      });
      void announceWithBalance(mode === 'replace' ? 'Datos reemplazados.' : 'Datos fusionados.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
    } finally {
      setImporting(false);
      setImportOpen(false);
    }
  }

  /** End the session. A failed call keeps the user signed in, so a reload cannot
   * silently restore a session the server never revoked. */
  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
    }
  }

  const budgetsBusy = setBudget.isPending || deleteBudget.isPending;
  const accountsBusy = createAccount.isPending || updateAccount.isPending || deleteAccount.isPending;
  const baseError = categoriesQuery.error ?? accountsQuery.error ?? null;

  return (
    <>
      {/* The skip link is the first focusable element in the document and lives
       * outside the sheet: from 720px the sheet carries a transform, which would
       * make a fixed descendant resolve against the sheet instead of the viewport
       * and miss the top-left corner. */}
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>

      <div className="desk">
        <div className="sheet">
          <span className="sheet-pin">
            <SheetPin />
          </span>

          <AppHeader
            monthLabel={monthFullLabel(month)}
            month={month}
            onPrev={() => goToMonth(shiftMonth(month, -1))}
            onNext={() => goToMonth(shiftMonth(month, 1))}
            onCurrentMonth={() => goToMonth(currentMonthKey())}
            onMonthChange={handleMonthChange}
            onExport={handleExport}
            onImport={() => {
              setBanner(null);
              setImportOpen(true);
            }}
            onNewMovement={() => openMovementWindow(null)}
            onOpenAdmin={() => {
              setBanner(null);
              setAdminOpen(true);
            }}
            onLogout={() => {
              void handleLogout();
            }}
            accounts={accounts}
            account={account}
            onAccountChange={changeAccount}
            busy={importing}
            lastRateMicros={lastVesRateMicros}
          />

          <main id="main">
            {banner && <Notice kind={banner.kind} text={banner.text} onDismiss={() => setBanner(null)} />}

            {baseError ? (
              <ErrorState
                message={readableError(baseError)}
                onRetry={() => {
                  void categoriesQuery.refetch();
                  void accountsQuery.refetch();
                }}
              />
            ) : null}

            {/* Los números del mes */}
            {summaryQuery.isPending ? (
              <LoadingState label="Cargando resumen…" />
            ) : summaryQuery.isError ? (
              <ErrorState
                message={readableError(summaryQuery.error)}
                onRetry={() => {
                  void summaryQuery.refetch();
                }}
              />
            ) : summaryQuery.data ? (
              <KpiSummary
                summary={summaryQuery.data}
                month={month}
                totalDebtCents={totalDebtCents}
                repaintKey={repaintKey}
              />
            ) : null}

            {/* El tablero · las facturas del mes */}
            {movementsQuery.isPending ? (
              <LoadingState label="Cargando movimientos…" />
            ) : movementsQuery.isError ? (
              <ErrorState
                message={readableError(movementsQuery.error)}
                onRetry={() => {
                  void movementsQuery.refetch();
                }}
              />
            ) : (
              <Board
                month={month}
                movements={movementsQuery.data ?? []}
                labelOf={labelOf}
                accountNameOf={accountNameOf}
                filter={filter}
                onFilterChange={(value) => {
                  setFilter(value);
                  announce(
                    value === 'all' ? 'Mostrando todas las categorías.' : `Filtrando por ${labelOf(value)}.`,
                  );
                }}
                onEdit={openMovementWindow}
                onDelete={handleDelete}
                flashId={flashId}
              />
            )}

            <div className="perf" />

            {/* La lista · tope y gastado */}
            {budgetsQuery.isPending ? (
              <LoadingState label="Cargando presupuestos…" />
            ) : budgetsQuery.isError ? (
              <ErrorState
                message={readableError(budgetsQuery.error)}
                onRetry={() => {
                  void budgetsQuery.refetch();
                }}
              />
            ) : budgetsQuery.data ? (
              <Budgets data={budgetsQuery.data} onSet={handleSetBudget} onClear={handleClearBudget} busy={budgetsBusy} />
            ) : null}

            <div className="rule" />

            {/* El reparto · gastos por categoría y los últimos meses */}
            <div className="cols">
              <section aria-labelledby="donut-title">
                <div className="sect">
                  <h2 id="donut-title">Gastos por categoría</h2>
                </div>
                {byCategoryQuery.isPending ? (
                  <LoadingState label="Cargando gastos…" />
                ) : byCategoryQuery.isError ? (
                  <ErrorState
                    message={readableError(byCategoryQuery.error)}
                    onRetry={() => {
                      void byCategoryQuery.refetch();
                    }}
                  />
                ) : byCategoryQuery.data ? (
                  <DonutChart data={byCategoryQuery.data} />
                ) : null}
              </section>

              <section aria-labelledby="bars-title">
                <div className="sect">
                  <h2 id="bars-title">Últimos 6 meses</h2>
                </div>
                {monthlyQuery.isPending ? (
                  <LoadingState label="Cargando meses…" />
                ) : monthlyQuery.isError ? (
                  <ErrorState
                    message={readableError(monthlyQuery.error)}
                    onRetry={() => {
                      void monthlyQuery.refetch();
                    }}
                  />
                ) : monthlyQuery.data ? (
                  <BarsChart data={monthlyQuery.data} selectedMonth={month} />
                ) : null}
              </section>
            </div>

            <div className="rule" />

            {/* El plan 25/15/50/10 */}
            {planQuery.isPending ? (
              <LoadingState label="Cargando plan…" />
            ) : planQuery.isError ? (
              <ErrorState
                message={readableError(planQuery.error)}
                onRetry={() => {
                  void planQuery.refetch();
                }}
              />
            ) : planQuery.data ? (
              <JarsPanel data={planQuery.data} labelOf={labelOf} totalDebtCents={totalDebtCents} />
            ) : null}

            <div className="rule" />

            {/* Las carteras */}
            {accountsQuery.isPending ? (
              <LoadingState label="Cargando carteras…" />
            ) : accountsQuery.isError ? (
              <ErrorState
                message={readableError(accountsQuery.error)}
                onRetry={() => {
                  void accountsQuery.refetch();
                }}
              />
            ) : accountsQuery.data ? (
              <AccountsPanel
                data={accountsQuery.data}
                today={todayStr()}
                busy={accountsBusy}
                onCreate={handleCreateAccount}
                onUpdate={handleUpdateAccount}
                onDelete={handleDeleteAccount}
                onPayDebt={handlePayDebt}
              />
            ) : null}

          </main>

          <div className="perf" />
          <p className="page-no">
            {summaryQuery.data
              ? `Pasa a la hoja siguiente · ${formatMoney(summaryQuery.data.balance_cents, 'USD')}`
              : 'Fin del documento'}
          </p>
        </div>
      </div>

      <MovementWindow
        open={movementOpen}
        categories={categories}
        accounts={accounts}
        editing={editing}
        month={month}
        defaultAccountId={account === 'all' ? null : account}
        lastVesRateMicros={lastVesRateMicros}
        estimate={{ summary: summaryQuery.data ?? null, budgets: budgetsQuery.data ?? null }}
        onSubmit={handleSubmit}
        onClose={closeMovementWindow}
        onError={announce}
      />

      <ImportWindow
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        onError={announce}
        busy={importing}
      />

      <AdminWindow open={adminOpen} onClose={() => setAdminOpen(false)} />

      {pendingConfirm?.kind === 'movement' && (
        <ConfirmWindow
          open
          title="Borrar movimiento"
          destructive
          confirmLabel="Borrar movimiento"
          confirmBusy={deleteMovement.isPending}
          onConfirm={confirmDeleteMovement}
          onCancel={cancelConfirm}
        >
          <p>
            ¿Borrar el movimiento {labelOf(pendingConfirm.movement.category_id)} ·{' '}
            {formatMoney(pendingConfirm.movement.amount_cents, 'USD')} ·{' '}
            {formatDateDisplay(pendingConfirm.movement.date)}?
          </p>
          <p>
            Se quita del libro de {monthFullLabel(month)} y los totales se reescriben. No se puede deshacer.
          </p>
        </ConfirmWindow>
      )}

      {pendingConfirm?.kind === 'account' && (
        <ConfirmWindow
          open
          title="Borrar cartera"
          destructive
          confirmLabel="Borrar cartera"
          confirmBusy={deleteAccount.isPending}
          onConfirm={confirmDeleteAccount}
          onCancel={cancelConfirm}
        >
          <p>¿Borrar la cartera "{pendingConfirm.account.name}"?</p>
          <p>La cartera y su saldo salen del tablero. No se puede deshacer.</p>
        </ConfirmWindow>
      )}
    </>
  );
}
