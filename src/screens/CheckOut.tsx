import { useState } from 'react';
import { LogOut, ArrowLeft, Receipt, AlertTriangle, Building2 } from 'lucide-react';
import { useNav } from '../nav';
import {
  useReservation, useFolio, usePostPayment, useCheckOut, useCreateInvoice, useCompanies,
} from '../queries';
import { useAuthStore } from '../stores';
import { Card, Pill, Button, SectionHeader, Field, Select, TextInput, Modal } from '../ui';
import { QueryState, useToast, MoneyInput, ErrorNote, PermissionButton } from '../components';
import { money, longDate, timestamp } from '../format';

const PAYMENT_METHODS = ['Cash', 'Visa', 'Mastercard', 'Amex', 'Bank transfer', 'Company account', 'OTA prepaid'];

export function CheckOutScreen({ reservationId }: { reservationId?: string }) {
  const { navigate, back } = useNav();
  const toast = useToast();
  const property = useAuthStore((s) => s.property);
  const reservation = useReservation(reservationId);
  const postPayment = usePostPayment();
  const checkOut = useCheckOut();
  const createInvoice = useCreateInvoice();
  const companies = useCompanies();

  const primaryFolioId = reservation.data?.folios?.[0]?.id;
  const folio = useFolio(primaryFolioId);

  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceTo, setInvoiceTo] = useState('');
  const [invoiceCompany, setInvoiceCompany] = useState('');
  const [toCityLedger, setToCityLedger] = useState(false);

  if (!reservationId) {
    return (
      <div className="py-16 text-center">
        <p className="font-bold mb-1">No reservation selected</p>
        <Button className="mt-3" onClick={() => navigate('departures')}>Go to departures</Button>
      </div>
    );
  }

  const balance = folio.data?.balanceMinor ?? reservation.data?.balanceMinor ?? 0;
  const settleAmount = amountMinor ?? Math.max(0, balance);

  async function takePayment() {
    if (!primaryFolioId || settleAmount <= 0) return;
    setError(null);
    try {
      await postPayment.mutateAsync({
        folioId: primaryFolioId,
        body: { amountMinor: settleAmount, method, reference: reference || undefined },
      });
      toast.success(`${money(settleAmount)} received`);
      setAmountMinor(null);
      setReference('');
    } catch (e) {
      setError(e);
      toast.fail(e, 'Payment failed');
    }
  }

  async function finish(allowBalance = false) {
    setError(null);
    try {
      const res = await checkOut.mutateAsync({ id: reservationId!, body: { allowBalance } });
      toast.success(`${res.guest} checked out`);
      navigate('departures');
    } catch (e) {
      setError(e);
      toast.fail(e, 'Check-out failed');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={back} className="text-dash-muted hover:text-black"><ArrowLeft className="w-4 h-4" /></button>
        <SectionHeader eyebrow="Front office" title="Check-out" />
      </div>

      <QueryState query={reservation} loadingRows={5}>
        {(r) => {
          if (r.status === 'Checked-out') {
            return (
              <Card tone="mint">
                <p className="text-[14px] font-bold mb-1">{r.guest} has already checked out</p>
                <p className="text-[12px] text-dash-muted mb-4">
                  Departed {timestamp(r.checkedOutAt)} · final balance {money(r.balanceMinor)}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => navigate('guest-dashboard', { reservationId: r.id })}>
                    View folio
                  </Button>
                  <Button onClick={() => navigate('departures')}>Back to departures</Button>
                </div>
              </Card>
            );
          }
          if (r.status !== 'Checked-in') {
            return (
              <Card tone="peach">
                <p className="text-[14px] font-bold mb-1">Only an in-house guest can be checked out</p>
                <p className="text-[12px] text-dash-muted">This reservation is {r.status}.</p>
              </Card>
            );
          }

          const earlyDeparture = property && property.businessDate < r.departure;

          return (
            <div className="grid lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 space-y-3">
                <Card>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[16px] font-bold">{r.guest}</p>
                        {r.vip && <Pill tone="yellow" solid>VIP</Pill>}
                      </div>
                      <p className="text-[11px] text-dash-muted">
                        {r.confirmation} · room {r.room} · {r.roomType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted">Balance</p>
                      <p className={`text-[22px] font-black tabular-nums ${balance > 0 ? 'text-status-bad' : balance < 0 ? 'text-status-info' : 'text-status-ok'}`}>
                        {money(balance)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t subtle-divider">
                    <Detail label="Arrived" value={longDate(r.arrival)} />
                    <Detail label="Departing" value={longDate(r.departure)} />
                    <Detail label="Nights" value={String(r.nights)} />
                    <Detail label="Rate plan" value={r.rateCode} />
                  </div>
                </Card>

                {earlyDeparture && (
                  <div className="rounded-2xl bg-dash-sky/40 border border-black/5 p-3 flex items-start gap-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-status-info mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-relaxed">
                      This is an early departure — booked to {longDate(r.departure)}, leaving on{' '}
                      {longDate(property!.businessDate)}. The unstayed nights will be removed from the
                      reservation and released back to inventory.
                    </p>
                  </div>
                )}

                {/* Folio */}
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted">
                      Folio {folio.data?.number}
                    </p>
                    <Button size="sm" variant="ghost"
                      onClick={() => navigate('guest-dashboard', { reservationId: r.id })}>
                      Full folio
                    </Button>
                  </div>
                  <QueryState query={folio} loadingRows={4}>
                    {(f) => (
                      <>
                        <div className="max-h-[280px] overflow-y-auto scroll-thin -mx-1 px-1">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-dash-muted">
                                <th className="pb-2">Date</th>
                                <th className="pb-2">Description</th>
                                <th className="pb-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {f.lines.map((l) => (
                                <tr key={l.id} className={l.voided ? 'opacity-40 line-through' : ''}>
                                  <td className="py-1.5 text-dash-muted">{l.businessDate.slice(5)}</td>
                                  <td className="py-1.5">
                                    <span className={l.kind === 'tax' ? 'text-dash-muted pl-3' : 'font-semibold'}>
                                      {l.description}
                                    </span>
                                  </td>
                                  <td className={`py-1.5 text-right tabular-nums font-semibold ${l.amountMinor < 0 ? 'text-status-ok' : ''}`}>
                                    {money(l.amountMinor)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="border-t subtle-divider mt-3 pt-3 space-y-1.5">
                          <Row label="Charges" value={money(f.chargesMinor)} />
                          <Row label="Taxes" value={money(f.taxesMinor)} />
                          <Row label="Payments" value={money(f.paymentsMinor)} />
                          {f.adjustmentsMinor !== 0 && <Row label="Adjustments" value={money(f.adjustmentsMinor)} />}
                          <div className="border-t subtle-divider pt-2">
                            <Row label="Balance due" value={money(f.balanceMinor)} strong />
                          </div>
                        </div>
                      </>
                    )}
                  </QueryState>
                </Card>

                {error && <ErrorNote error={error} />}
              </div>

              {/* Settlement rail */}
              <div className="space-y-3">
                {balance > 0 && (
                  <Card tone="yellow">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted mb-3">Take payment</p>
                    <div className="space-y-3">
                      <Field label="Amount">
                        <MoneyInput valueMinor={settleAmount} onChange={setAmountMinor} />
                      </Field>
                      <Field label="Method">
                        <Select value={method} onChange={setMethod}
                          options={PAYMENT_METHODS.map((m) => ({ label: m, value: m }))} />
                      </Field>
                      <Field label="Reference" hint="Card auth code, transfer reference…">
                        <TextInput value={reference} onChange={setReference} placeholder="optional" />
                      </Field>
                      <PermissionButton
                        permission="folio.payment"
                        className="w-full"
                        disabled={postPayment.isPending || settleAmount <= 0}
                        onClick={takePayment}
                      >
                        {postPayment.isPending ? 'Posting…' : `Take ${money(settleAmount)}`}
                      </PermissionButton>
                    </div>
                  </Card>
                )}

                <Card>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted mb-3">Complete check-out</p>
                  {balance === 0 ? (
                    <p className="text-[11px] text-dash-muted mb-3">
                      The folio is settled. Checking out will release the room to housekeeping and close the folio.
                    </p>
                  ) : (
                    <p className="text-[11px] text-status-bad font-semibold mb-3">
                      {money(balance)} outstanding — settle it, bill it to a company account, or check out with a
                      balance if you have authority to do so.
                    </p>
                  )}
                  <div className="space-y-2">
                    <PermissionButton
                      permission="frontdesk.write"
                      className="w-full"
                      icon={<LogOut className="w-3.5 h-3.5" />}
                      disabled={checkOut.isPending || balance !== 0}
                      onClick={() => finish(false)}
                    >
                      {checkOut.isPending ? 'Checking out…' : 'Check out'}
                    </PermissionButton>

                    {balance !== 0 && (
                      <>
                        <Button
                          variant="secondary"
                          className="w-full"
                          icon={<Building2 className="w-3.5 h-3.5" />}
                          onClick={() => { setToCityLedger(true); setInvoiceTo(r.guest); setInvoiceOpen(true); }}
                        >
                          Bill to company account
                        </Button>
                        <PermissionButton
                          permission="folio.void"
                          variant="danger"
                          className="w-full"
                          disabled={checkOut.isPending}
                          onClick={() => finish(true)}
                        >
                          Check out with balance
                        </PermissionButton>
                      </>
                    )}

                    <Button
                      variant="secondary"
                      className="w-full"
                      icon={<Receipt className="w-3.5 h-3.5" />}
                      onClick={() => { setToCityLedger(false); setInvoiceTo(r.guest); setInvoiceOpen(true); }}
                    >
                      Issue invoice
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          );
        }}
      </QueryState>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title={toCityLedger ? 'Bill to a company account' : 'Issue an invoice'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button
              disabled={createInvoice.isPending || !invoiceTo || (toCityLedger && !invoiceCompany)}
              onClick={async () => {
                if (!primaryFolioId) return;
                try {
                  const inv = await createInvoice.mutateAsync({
                    folioId: primaryFolioId,
                    body: {
                      billTo: invoiceTo,
                      companyId: invoiceCompany || undefined,
                      toAr: toCityLedger,
                    },
                  });
                  toast.success(`Invoice ${inv.number} issued`,
                    toCityLedger ? 'Balance moved to the city ledger' : undefined);
                  setInvoiceOpen(false);
                } catch (e) {
                  toast.fail(e, 'Could not issue the invoice');
                }
              }}
            >
              {createInvoice.isPending ? 'Issuing…' : 'Issue invoice'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Bill to" required>
            <TextInput value={invoiceTo} onChange={setInvoiceTo} placeholder="Guest or company name" />
          </Field>
          {toCityLedger && (
            <Field label="Company account" required hint="The balance becomes a receivable against this account">
              <Select
                value={invoiceCompany}
                onChange={setInvoiceCompany}
                options={[
                  { label: 'Select a company', value: '' },
                  ...(companies.data ?? []).filter((c) => c.arEnabled).map((c) => ({
                    label: `${c.name} (${c.code})`, value: c.id,
                  })),
                ]}
              />
            </Field>
          )}
          {toCityLedger && (companies.data ?? []).filter((c) => c.arEnabled).length === 0 && (
            <p className="text-[11px] text-status-bad">
              No company has direct billing enabled. Add one in Configuration → Companies.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-dash-muted mb-0.5">{label}</p>
      <p className="text-[12px] font-semibold">{value}</p>
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
