import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { BarsChart } from './components/BarsChart';
import { Budgets } from './components/Budgets';
import { DonutChart } from './components/DonutChart';
import { KpiSummary } from './components/KpiSummary';
import { MovementForm } from './components/MovementForm';
import { MovementsTable } from './components/MovementsTable';
import { ErrorState, LoadingState } from './components/States';
import { useAnnounce } from './components/LiveRegion';
import { api, readableError } from './api/client';
import {
  useBudgets,
  useByCategory,
  useCategories,
  useCreateMovement,
  useDeleteBudget,
  useDeleteMovement,
  useImportData,
  useMonthly,
  useMovements,
  useSetBudget,
  useSummary,
  useUpdateMovement,
} from './api/queries';
import type { ImportMode, Movement, MovementInput } from './api/types';
import { formatMoney } from './lib/money';
import { currentMonthKey, formatDateDisplay, monthFullLabel, shiftMonth, todayStr } from './lib/month';

interface Banner {
  kind: 'success' | 'error';
  text: string;
}

/** Límite de la API para el cuerpo del import (5 MB): se valida acá para dar un error claro. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function App() {
  const announce = useAnnounce();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<Movement | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [importing, setImporting] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  const categoriesQuery = useCategories();
  const movementsQuery = useMovements(month);
  const summaryQuery = useSummary(month);
  const byCategoryQuery = useByCategory(month);
  const monthlyQuery = useMonthly(month, 6);
  const budgetsQuery = useBudgets(month);

  const createMovement = useCreateMovement();
  const updateMovement = useUpdateMovement();
  const deleteMovement = useDeleteMovement();
  const setBudget = useSetBudget();
  const deleteBudget = useDeleteBudget();
  const importData = useImportData();

  useEffect(() => {
    setFilter('all');
    setEditing(null);
  }, [month]);

  const categories = categoriesQuery.data ?? [];
  const labelOf = useCallback(
    (id: string) => categories.find((category) => category.id === id)?.label ?? id,
    [categories],
  );

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
        announce(`${prefix} Te queda ${formatMoney(balance)}.`);
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
    announce(`Mes ${monthFullLabel(next)}.`);
  }

  async function handleSubmit(input: MovementInput, current: Movement | null) {
    try {
      if (current) {
        await updateMovement.mutateAsync({ id: current.id, patch: input });
        setEditing(null);
        void announceWithBalance('Movimiento actualizado.');
      } else {
        await createMovement.mutateAsync(input);
        void announceWithBalance('Movimiento agregado.');
      }
    } catch (error) {
      announce(readableError(error));
      throw error;
    }
  }

  function handleEdit(movement: Movement) {
    setEditing(movement);
    setBanner(null);
    announce('Editando movimiento.');
    formRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  async function handleDelete(movement: Movement) {
    const confirmed = window.confirm(
      `¿Borrar este movimiento?\n\n${labelOf(movement.category_id)} · ${formatMoney(movement.amount_cents)} · ${formatDateDisplay(movement.date)}`,
    );
    if (!confirmed) return;
    try {
      await deleteMovement.mutateAsync(movement.id);
      if (editing?.id === movement.id) setEditing(null);
      void announceWithBalance('Movimiento borrado.');
    } catch (error) {
      setBanner({ kind: 'error', text: readableError(error) });
      announce(readableError(error));
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

      if (mode === 'replace') {
        const confirmed = window.confirm(
          '¿Reemplazar TODOS los datos actuales con el archivo importado? Esta acción no se puede deshacer.',
        );
        if (!confirmed) {
          announce('Importación cancelada.');
          return;
        }
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
    }
  }

  const budgetsBusy = setBudget.isPending || deleteBudget.isPending;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-[22px] pb-16">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>

      <AppHeader
        monthLabel={monthFullLabel(month)}
        onPrev={() => goToMonth(shiftMonth(month, -1))}
        onNext={() => goToMonth(shiftMonth(month, 1))}
        onCurrentMonth={() => goToMonth(currentMonthKey())}
        onExport={handleExport}
        onImport={handleImport}
        busy={importing}
      />

      <main id="main" className="grid gap-4">
        {banner && (
          <div className={banner.kind === 'success' ? 'banner success' : 'banner error'}>{banner.text}</div>
        )}

        <div className="grid gap-4 min-[861px]:grid-cols-[minmax(320px,1fr)_1.08fr] min-[861px]:items-start">
          <div ref={formRef} className="min-w-0">
            {categoriesQuery.isPending ? (
              <section className="card">
                <LoadingState label="Cargando categorías…" />
              </section>
            ) : categoriesQuery.isError ? (
              <section className="card">
                <ErrorState
                  message={readableError(categoriesQuery.error)}
                  onRetry={() => {
                    void categoriesQuery.refetch();
                  }}
                />
              </section>
            ) : (
              <MovementForm
                categories={categories}
                editing={editing}
                month={month}
                onSubmit={handleSubmit}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>

          {summaryQuery.isPending ? (
            <section className="card">
              <LoadingState label="Cargando resumen…" />
            </section>
          ) : summaryQuery.isError ? (
            <section className="card">
              <ErrorState
                message={readableError(summaryQuery.error)}
                onRetry={() => {
                  void summaryQuery.refetch();
                }}
              />
            </section>
          ) : summaryQuery.data ? (
            <KpiSummary summary={summaryQuery.data} month={month} />
          ) : null}
        </div>

        <div className="grid gap-4 min-[861px]:grid-cols-2">
          <section className="card" aria-labelledby="donut-title">
            <h2 id="donut-title">Gastos por categoría</h2>
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

          <section className="card" aria-labelledby="bars-title">
            <h2 id="bars-title">Últimos 6 meses</h2>
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

        {budgetsQuery.isPending ? (
          <section className="card">
            <LoadingState label="Cargando presupuestos…" />
          </section>
        ) : budgetsQuery.isError ? (
          <section className="card">
            <ErrorState
              message={readableError(budgetsQuery.error)}
              onRetry={() => {
                void budgetsQuery.refetch();
              }}
            />
          </section>
        ) : budgetsQuery.data ? (
          <Budgets
            data={budgetsQuery.data}
            onSet={handleSetBudget}
            onClear={handleClearBudget}
            busy={budgetsBusy}
          />
        ) : null}

        {movementsQuery.isPending ? (
          <section className="card">
            <LoadingState label="Cargando movimientos…" />
          </section>
        ) : movementsQuery.isError ? (
          <section className="card">
            <ErrorState
              message={readableError(movementsQuery.error)}
              onRetry={() => {
                void movementsQuery.refetch();
              }}
            />
          </section>
        ) : (
          <MovementsTable
            movements={movementsQuery.data ?? []}
            labelOf={labelOf}
            filter={filter}
            onFilterChange={(value) => {
              setFilter(value);
              announce(value === 'all' ? 'Mostrando todas las categorías.' : `Filtrando por ${labelOf(value)}.`);
            }}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </main>
    </div>
  );
}
