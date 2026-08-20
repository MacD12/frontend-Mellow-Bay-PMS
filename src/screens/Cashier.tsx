import { useState, useMemo } from 'react';
import { Search, Plus, Receipt, Wallet, Lock, Unlock, ArrowRightLeft } from 'lucide-react';
import { useNav } from '../nav';
import {
  useFolios, useFolio, usePostCharge, usePostPayment, useVoidLine, useTransferLine,
  useTransactionCodes, useCashierShift, useOpenShift, useCloseShift, useOutstanding,
} from '../queries';
import { Card, Pill, Button, SectionHeader, Tabs, Field, Select, TextInput, Modal, DataGrid, type GridCol } from '../ui';
import { QueryState, useToast, MoneyInput, NumberInput, PermissionButton, statusTone } from '../components';
import { money, clock, timestamp } from '../format';
import type { FolioSummary } from '../types';

const PAYMENT_METHODS = ['Cash', 'Visa', 'Mastercard', 'Amex', 'Bank transfer', 'Company account', 'Voucher'];

export function CashierScreen({ folioId: initialFolioId }: { folioId?: string }) {
  const { navigate } = useNav();
  const toast = useToast();
  const folios = useFolios();
  const codes = useTransactionCodes();
  const shift = useCashierShift();
  const outstanding = useOutstanding();
  const openShift = useOpenShift();
  const closeShift = useCloseShift();
  const postCharge = usePostCharge();
  const postPayment = usePostPayment();
  const voidLine = useVoidLine();
  const transferLine = useTransferLine();

  const [tab, setTab] = useState<'open' | 'outstanding' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialFolioId);
  const folio = useFolio(selectedId);

  const [chargeOpen, setChargeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shiftOpenModal, setShiftOpenModal] = useState(false);
  const [shiftCloseModal, setShiftCloseModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{ id: string; description: string } | null>(null);

  const [chargeCode, setChargeCode] = useState('');
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeQty, setChargeQty] = useState(1);
  const [chargeUnit, setChargeUnit] = useState(0);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [floatMinor, setFloatMinor] = useState(0);
  const [countedMinor, setCountedMinor] = useState(0);
  const [shiftNote, setShiftNote] = useState('');
  const [transferTo, setTransferTo] = useState('');

  const folioCols: GridCol<FolioSummary>[] = [
    { key: 'number', header: 'Folio', render: (f) => <span className="font-mono text-[11px] font-bold">{f.number}</span> },
    {
      key: 'guest', header: 'Guest / account',
      render: (f) => (
        <div className="min-w-0">
          <p className="font-bold truncate">{f.guest ?? f.name}</p>
          <p className="text-[10px] text-dash-muted">
            {f.confirmation ?? f.type}{f.room ? ` · room ${f.room}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Reservation',
      render: (f) => f.reservationStatus
        ? <Pill tone={statusTone(f.reservationStatus)}>{f.reservationStatus}</Pill>
        : <Pill tone="grey">{f.type}</Pill>,
    },
    {
      key: 'balance', header: 'Balance', align: 'right',
      render: (f) => (
        <span className={`tabular-nums font-bold ${f.balanceMinor > 0 ? 'text-status-bad' : f.balanceMinor < 0 ? 'text-status-info' : ''}`}>
          {money(f.balanceMinor)}
        </span>
      ),
    },
    { key: 'folioStatus', header: '', align: 'right', render: (f) => <Pill tone={f.status === 'open' ? 'mint' : 'grey'}>{f.status}</Pill> },
  ];

  const shiftData = shift.data;

  return (
    <div>
      <SectionHeader
        eyebrow="Finance"
        title="Cashier"
        action={
          shiftData?.open ? (
            <div className="flex items-center gap-2">
              <Pill tone="mint" solid>Shift open since {clock(shiftData.openedAt)}</Pill>
              <PermissionButton permission="folio.payment" variant="secondary" icon={<Lock className="w-3.5 h-3.5" />}
                onClick={() => { setCountedMinor(shiftData.expectedCashMinor ?? 0); setShiftCloseModal(true); }}>
                Close shift
              </PermissionButton>
            </div>
          ) : (
            <PermissionButton permission="folio.payment" icon={<Unlock className="w-3.5 h-3.5" />}
              onClick={() => setShiftOpenModal(true)}>
              Open shift
            </PermissionButton>
          )
        }
      />

      {shiftData?.open && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card tone="mint"><Metric label="Payments this shift" value={money(shiftData.paymentsMinor ?? 0)} /></Card>
          <Card tone="sky"><Metric label="Charges posted" value={money(shiftData.chargesMinor ?? 0)} /></Card>
          <Card><Metric label="Expected cash" value={money(shiftData.expectedCashMinor ?? 0)}
            sub={`float ${money(shiftData.openingFloatMinor ?? 0)}`} /></Card>
          <Card><Metric label="Postings" value={String(shiftData.lines ?? 0)} /></Card>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-3">
        {/* Folio list */}
        {/* `min-w-0` so this column can shrink below the width of the folio
            table inside it — a grid child otherwise refuses to, and the table
            stretches the whole screen instead of scrolling in its own box. */}
        <div className="lg:col-span-2 space-y-3 min-w-0">
          <Card padded={false} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tabs
                tabs={[
                  { value: 'open', label: 'Open' },
                  { value: 'outstanding', label: 'Owing' },
                  { value: 'all', label: 'All' },
                ]}
                active={tab}
                onChange={setTab}
              />
            </div>
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-dash-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Guest, room or folio number…"
                className="w-full bg-white border border-black/10 rounded-full pl-9 pr-4 py-2 text-[12px] outline-none focus:border-black/30"
              />
            </div>

            {tab === 'outstanding' ? (
              <QueryState query={outstanding} loadingRows={4} empty="Every folio is settled">
                {(rows) => (
                  <div className="space-y-1.5 max-h-[520px] overflow-y-auto scroll-thin">
                    {rows
                      .filter((r: any) => !search || (r.guest ?? '').toLowerCase().includes(search.toLowerCase()))
                      .map((r: any) => (
                        <button
                          key={r.folioId}
                          onClick={() => setSelectedId(r.folioId)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left ${
                            selectedId === r.folioId ? 'bg-dash-bg' : 'hover:bg-dash-bg'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold truncate">{r.guest ?? r.name}</p>
                            <p className="text-[10px] text-dash-muted">
                              {r.number} · {r.room ? `room ${r.room}` : r.reservationStatus ?? ''}
                            </p>
                          </div>
                          <span className={`text-[12px] font-bold tabular-nums ${r.balanceMinor > 0 ? 'text-status-bad' : 'text-status-info'}`}>
                            {money(r.balanceMinor)}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </QueryState>
            ) : (
              <QueryState query={folios} loadingRows={4} empty="No folios yet">
                {(rows) => {
                  const q = search.trim().toLowerCase();
                  const filtered = rows
                    .filter((f) => tab === 'all' || f.status === 'open')
                    .filter((f) => !q
                      || (f.guest ?? f.name).toLowerCase().includes(q)
                      || f.number.toLowerCase().includes(q)
                      || (f.room ?? '').toLowerCase().includes(q));
                  return (
                    <div className="max-h-[520px] overflow-y-auto scroll-thin">
                      <DataGrid
                        rows={filtered}
                        cols={folioCols}
                        onRowClick={(f) => setSelectedId(f.id)}
                        emptyTitle="No folios match"
                      />
                    </div>
                  );
                }}
              </QueryState>
            )}
          </Card>
        </div>

        {/* Selected folio */}
        <div className="lg:col-span-3 min-w-0">
          {!selectedId ? (
            <Card className="h-full flex flex-col items-center justify-center py-20">
              <Wallet className="w-8 h-8 text-dash-muted mb-3" />
              <p className="text-[13px] font-bold mb-1">Select a folio</p>
              <p className="text-[12px] text-dash-muted">Pick a guest on the left to post charges or take payment.</p>
            </Card>
          ) : (
            <QueryState query={folio} loadingRows={6}>
              {(f) => (
                <Card>
                  <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[16px] font-bold">{f.reservation?.guest ?? f.name}</p>
                        <Pill tone={f.status === 'open' ? 'mint' : 'grey'}>{f.status}</Pill>
                      </div>
                      <p className="text-[11px] text-dash-muted">
                        Folio {f.number} · window {f.windowNo}
                        {f.reservation ? ` · ${f.reservation.confirmation} · room ${f.reservation.room ?? '—'}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted">Balance</p>
                      <p className={`text-[22px] font-black tabular-nums ${f.balanceMinor > 0 ? 'text-status-bad' : f.balanceMinor < 0 ? 'text-status-info' : 'text-status-ok'}`}>
                        {money(f.balanceMinor)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <PermissionButton permission="folio.post" size="sm" icon={<Plus className="w-3 h-3" />}
                      disabled={f.status !== 'open'} onClick={() => setChargeOpen(true)}>
                      Post charge
                    </PermissionButton>
                    <PermissionButton permission="folio.payment" size="sm" variant="secondary"
                      icon={<Receipt className="w-3 h-3" />} disabled={f.status !== 'open'}
                      onClick={() => { setPayAmount(Math.max(0, f.balanceMinor)); setPaymentOpen(true); }}>
                      Take payment
                    </PermissionButton>
                    {f.reservation && (
                      <Button size="sm" variant="ghost"
                        onClick={() => navigate('guest-dashboard', { reservationId: f.reservation!.id })}>
                        Guest dashboard
                      </Button>
                    )}
                  </div>

                  {f.lines.length === 0 ? (
                    <p className="text-[12px] text-dash-muted py-10 text-center">Nothing posted to this folio yet.</p>
                  ) : (
                    <div className="overflow-x-auto scroll-thin max-h-[440px]">
                      <table className="w-full min-w-[40rem] text-[12px]">
                        <thead className="sticky top-0 bg-white">
                          <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-dash-muted border-b subtle-divider">
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Code</th>
                            <th className="pb-2">Description</th>
                            <th className="pb-2 text-right">Amount</th>
                            <th className="pb-2 text-right">By</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {f.lines.map((l) => (
                            <tr key={l.id} className={`border-b border-black/[0.03] ${l.voided ? 'opacity-40' : ''}`}>
                              <td className="py-2 text-dash-muted whitespace-nowrap">{l.businessDate}</td>
                              <td className="py-2 font-mono text-[10px]">{l.code}</td>
                              <td className={`py-2 ${l.kind === 'tax' ? 'text-dash-muted pl-4' : 'font-semibold'} ${l.voided ? 'line-through' : ''}`}>
                                {l.description}
                                {l.method ? <span className="text-dash-muted"> · {l.method}</span> : ''}
                              </td>
                              <td className={`py-2 text-right tabular-nums font-bold ${l.amountMinor < 0 ? 'text-status-ok' : ''}`}>
                                {money(l.amountMinor)}
                              </td>
                              <td className="py-2 text-right text-[10px] text-dash-muted">{l.postedBy}</td>
                              <td className="py-2 text-right whitespace-nowrap">
                                {!l.voided && !l.parentLineId && f.status === 'open' && (
                                  <>
                                    <PermissionButton permission="folio.post" size="sm" variant="ghost"
                                      icon={<ArrowRightLeft className="w-3 h-3" />}
                                      onClick={() => { setTransferTarget({ id: l.id, description: l.description }); setTransferTo(''); }} />
                                    <PermissionButton permission="folio.void" size="sm" variant="ghost"
                                      onClick={async () => {
                                        const reason = window.prompt(`Void "${l.description}" — reason?`);
                                        if (!reason) return;
                                        try {
                                          await voidLine.mutateAsync({ lineId: l.id, reason });
                                          toast.success('Posting voided');
                                        } catch (e) { toast.fail(e); }
                                      }}>
                                      Void
                                    </PermissionButton>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="border-t subtle-divider mt-4 pt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Total label="Charges" value={money(f.chargesMinor)} />
                    <Total label="Taxes" value={money(f.taxesMinor)} />
                    <Total label="Payments" value={money(f.paymentsMinor)} />
                    <Total label="Balance" value={money(f.balanceMinor)} strong />
                  </div>
                </Card>
              )}
            </QueryState>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal open={chargeOpen} onClose={() => setChargeOpen(false)} title="Post a charge"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setChargeOpen(false)}>Cancel</Button>
            <Button disabled={!chargeCode || chargeUnit <= 0 || postCharge.isPending || !selectedId}
              onClick={async () => {
                try {
                  await postCharge.mutateAsync({
                    folioId: selectedId!,
                    body: { code: chargeCode, description: chargeDesc || undefined, qty: chargeQty, unitMinor: chargeUnit },
                  });
                  toast.success(`${money(chargeQty * chargeUnit)} posted`);
                  setChargeOpen(false); setChargeCode(''); setChargeDesc(''); setChargeQty(1); setChargeUnit(0);
                } catch (e) { toast.fail(e); }
              }}>
              {postCharge.isPending ? 'Posting…' : `Post ${money(chargeQty * chargeUnit)}`}
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <Field label="Transaction code" required>
            <Select value={chargeCode}
              onChange={(v) => {
                setChargeCode(v);
                const tc = codes.data?.find((c) => c.code === v);
                if (tc) { setChargeDesc(tc.name); if (tc.defaultPriceMinor) setChargeUnit(tc.defaultPriceMinor); }
              }}
              options={[
                { label: 'Select a code', value: '' },
                ...(codes.data ?? []).filter((c) => c.active && c.category !== 'payment')
                  .map((c) => ({ label: `${c.code} · ${c.name}`, value: c.code })),
              ]} />
          </Field>
          <Field label="Description"><TextInput value={chargeDesc} onChange={setChargeDesc} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity"><NumberInput value={chargeQty} onChange={setChargeQty} min={1} max={999} /></Field>
            <Field label="Unit price"><MoneyInput valueMinor={chargeUnit} onChange={setChargeUnit} /></Field>
          </div>
        </div>
      </Modal>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Take a payment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button disabled={payAmount <= 0 || postPayment.isPending || !selectedId}
              onClick={async () => {
                try {
                  await postPayment.mutateAsync({
                    folioId: selectedId!,
                    body: { amountMinor: payAmount, method: payMethod, reference: payRef || undefined },
                  });
                  toast.success(`${money(payAmount)} received`);
                  setPaymentOpen(false); setPayRef('');
                } catch (e) { toast.fail(e); }
              }}>
              {postPayment.isPending ? 'Posting…' : `Take ${money(payAmount)}`}
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <Field label="Amount" required><MoneyInput valueMinor={payAmount} onChange={setPayAmount} /></Field>
          <Field label="Method" required>
            <Select value={payMethod} onChange={setPayMethod}
              options={PAYMENT_METHODS.map((m) => ({ label: m, value: m }))} />
          </Field>
          <Field label="Reference"><TextInput value={payRef} onChange={setPayRef} /></Field>
        </div>
      </Modal>

      <Modal open={!!transferTarget} onClose={() => setTransferTarget(null)} title="Transfer this posting"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTransferTarget(null)}>Cancel</Button>
            <Button disabled={!transferTo || transferLine.isPending}
              onClick={async () => {
                if (!transferTarget) return;
                try {
                  await transferLine.mutateAsync({ lineId: transferTarget.id, targetFolioId: transferTo });
                  toast.success('Posting transferred');
                  setTransferTarget(null);
                } catch (e) { toast.fail(e); }
              }}>
              Transfer
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <p className="text-[12px] text-dash-muted">
            Move <span className="font-bold text-black">{transferTarget?.description}</span> and its taxes to another
            open folio.
          </p>
          <Field label="Destination folio" required>
            <Select value={transferTo} onChange={setTransferTo}
              options={[
                { label: 'Select a folio', value: '' },
                ...(folios.data ?? []).filter((f) => f.status === 'open' && f.id !== selectedId)
                  .map((f) => ({ label: `${f.number} · ${f.guest ?? f.name}`, value: f.id })),
              ]} />
          </Field>
        </div>
      </Modal>

      <Modal open={shiftOpenModal} onClose={() => setShiftOpenModal(false)} title="Open cashier shift"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShiftOpenModal(false)}>Cancel</Button>
            <Button disabled={openShift.isPending}
              onClick={async () => {
                try {
                  await openShift.mutateAsync({ openingFloatMinor: floatMinor });
                  toast.success('Shift opened');
                  setShiftOpenModal(false);
                } catch (e) { toast.fail(e); }
              }}>
              Open shift
            </Button>
          </div>
        }>
        <Field label="Opening float" hint="Cash in the drawer at the start of your shift">
          <MoneyInput valueMinor={floatMinor} onChange={setFloatMinor} />
        </Field>
      </Modal>

      <Modal open={shiftCloseModal} onClose={() => setShiftCloseModal(false)} title="Close cashier shift"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShiftCloseModal(false)}>Cancel</Button>
            <Button disabled={closeShift.isPending}
              onClick={async () => {
                try {
                  const res = await closeShift.mutateAsync({ countedMinor, note: shiftNote || undefined });
                  toast.success(
                    'Shift closed',
                    res.varianceMinor === 0
                      ? 'Drawer balanced exactly'
                      : `Variance ${money(res.varianceMinor)}`,
                  );
                  setShiftCloseModal(false); setShiftNote('');
                } catch (e) { toast.fail(e); }
              }}>
              Close shift
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <div className="rounded-2xl bg-dash-bg p-4 space-y-1.5">
            <Row label="Opening float" value={money(shiftData?.openingFloatMinor ?? 0)} />
            {(shiftData?.byMethod ?? []).map((m) => (
              <Row key={m.method} label={m.method} value={money(m.totalMinor)} />
            ))}
            <div className="border-t subtle-divider pt-2 mt-2">
              <Row label="Expected cash" value={money(shiftData?.expectedCashMinor ?? 0)} strong />
            </div>
          </div>
          <Field label="Counted cash" required>
            <MoneyInput valueMinor={countedMinor} onChange={setCountedMinor} />
          </Field>
          <div className="rounded-xl bg-dash-bg p-3">
            <Row
              label="Variance"
              value={money(countedMinor - (shiftData?.expectedCashMinor ?? 0))}
              strong
            />
          </div>
          <Field label="Note"><TextInput value={shiftNote} onChange={setShiftNote} placeholder="Explain any variance" /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted mb-2">{label}</p>
      <p className="text-[20px] font-black leading-none tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-dash-muted mt-1.5">{sub}</p>}
    </>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted mb-1">{label}</p>
      <p className={`tabular-nums ${strong ? 'text-[18px] font-black' : 'text-[14px] font-bold'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-dash-muted">{label}</span>
      <span className={`text-[12px] tabular-nums ${strong ? 'font-black' : 'font-bold'}`}>{value}</span>
    </div>
  );
}
