import { useState, useEffect, useCallback } from 'react';
import { NavContext } from './nav';
import { useAuthStore } from './stores';
import type { ScreenName, ScreenState } from './types';
import { AppShell } from './layout';

import { LoginScreen } from './screens/Login';
import { PasswordChangeScreen } from './screens/PasswordChange';
import { SetupScreen } from './screens/Setup';
import { PropertySelectScreen } from './screens/PropertySelect';
import { DashboardScreen } from './screens/Dashboard';
import { ReservationsScreen } from './screens/Reservations';
import { NewReservationScreen } from './screens/NewReservation';
import { ArrivalsScreen } from './screens/Arrivals';
import { CheckInScreen } from './screens/CheckIn';
import { InHouseScreen } from './screens/InHouse';
import { GuestDashboardScreen } from './screens/GuestDashboard';
import { DeparturesScreen } from './screens/Departures';
import { CheckOutScreen } from './screens/CheckOut';
import { CashierScreen } from './screens/Cashier';
import { HousekeepingScreen } from './screens/Housekeeping';
import { NightAuditScreen } from './screens/NightAudit';
import { InboxScreen } from './screens/Inbox';
import { ErrorBoundary } from './ErrorBoundary';
import { OverbookingScreen } from './screens/Overbooking';
import { ProfilesScreen } from './screens/Profiles';
import { ProfileDetailScreen } from './screens/ProfileDetail';
import { ReportsScreen } from './screens/Reports';
import { CalendarScreen } from './screens/Calendar';
import { ChannelManagerScreen } from './screens/ChannelManager';
import { RatesInventoryScreen } from './screens/RatesInventory';
import { GroupsScreen } from './screens/Groups';
import { AccountsReceivableScreen } from './screens/AccountsReceivable';
import { ConfigurationScreen } from './screens/Configuration';
import { AdministrationScreen } from './screens/Administration';

// ─── Hash routing ───────────────────────────────────────────────
// Auth-flow states (login / setup / property-select) are gated by session
// state rather than the URL, so they are deliberately not routes.
const VALID_ROUTES = new Set<ScreenName>([
  'dashboard', 'calendar', 'reservations', 'new-reservation',
  'arrivals', 'check-in', 'in-house', 'guest-dashboard',
  'departures', 'check-out', 'cashier', 'housekeeping',
  'night-audit', 'inbox', 'overbooking', 'profiles', 'profile-detail', 'reports',
  'rates-inventory', 'channel-manager', 'groups', 'ar', 'config', 'admin',
]);

const PARAM_KEYS: Partial<Record<ScreenName, string>> = {
  'check-in': 'reservationId',
  'guest-dashboard': 'reservationId',
  'check-out': 'reservationId',
  'profile-detail': 'profileId',
  'cashier': 'folioId',
  'ar': 'companyId',
  'new-reservation': 'reservationId',
};

function screenToHash(s: ScreenState): string {
  const parts: string[] = [s.name];
  const paramKey = PARAM_KEYS[s.name];
  if (paramKey && s.params?.[paramKey]) parts.push(encodeURIComponent(s.params[paramKey]));
  return '#/' + parts.join('/');
}

function hashToScreen(hash: string): ScreenState {
  const path = hash.replace(/^#\/?/, '').trim();
  if (!path) return { name: 'dashboard' };
  const [name, ...rest] = path.split('/');
  if (!VALID_ROUTES.has(name as ScreenName)) return { name: 'dashboard' };
  const screenName = name as ScreenName;
  const paramKey = PARAM_KEYS[screenName];
  if (paramKey && rest[0]) {
    return { name: screenName, params: { [paramKey]: decodeURIComponent(rest[0]) } };
  }
  return { name: screenName };
}

export default function App() {
  const phase = useAuthStore((s) => s.phase);
  const boot = useAuthStore((s) => s.boot);
  const storeLogout = useAuthStore((s) => s.logout);
  const switchPropertyAction = useAuthStore((s) => s.switchProperty);
  const bootError = useAuthStore((s) => s.error);

  const [screen, setScreen] = useState<ScreenState>(() =>
    typeof window !== 'undefined' ? hashToScreen(window.location.hash) : { name: 'dashboard' },
  );

  useEffect(() => { boot(); }, [boot]);

  useEffect(() => {
    const onChange = () => setScreen(hashToScreen(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((name: ScreenName, params?: Record<string, string>) => {
    if (!VALID_ROUTES.has(name)) return;
    const newHash = screenToHash({ name, params });
    if (window.location.hash === newHash) {
      setScreen({ name, params });
      return;
    }
    window.location.hash = newHash;
  }, []);

  const back = useCallback(() => { window.history.back(); }, []);

  const logout = useCallback(async () => {
    await storeLogout();
    window.location.hash = '#/dashboard';
  }, [storeLogout]);

  const switchProperty = useCallback(() => switchPropertyAction(), [switchPropertyAction]);

  // ─── Boot & auth gates ──────────────────────────────────────
  if (phase === 'booting') return <BootScreen />;
  if (phase === 'unreachable') return <UnreachableScreen message={bootError} onRetry={boot} />;
  if (phase === 'setup') return <SetupScreen />;
  if (phase === 'login') return <LoginScreen />;
  if (phase === 'password-change') return <PasswordChangeScreen />;
  if (phase === 'property-select') return <PropertySelectScreen />;

  return (
    <NavContext.Provider value={{ screen, navigate, back, logout, switchProperty }}>
      <AppShell breadcrumb={breadcrumbFor(screen)}>
        {/* Inside the shell, not around it: a screen that fails to render must
            leave the navigation, search and property switcher working, so the
            desk can carry on from somewhere else. Keyed by screen so moving
            away clears the error rather than carrying it to the next page. */}
        <ErrorBoundary
          resetKey={`${screen.name}:${JSON.stringify(screen.params ?? {})}`}
          onGoHome={() => navigate('dashboard')}
        >
          {renderScreen(screen)}
        </ErrorBoundary>
      </AppShell>
    </NavContext.Provider>
  );
}

function BootScreen() {
  return (
    <div className="h-screen bg-dash-bg flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-[3px] border-black/10 border-t-black rounded-full animate-spin" />
      <p className="text-[12px] font-bold text-dash-muted">Connecting to Helio…</p>
    </div>
  );
}

function UnreachableScreen({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="h-screen bg-dash-bg flex items-center justify-center p-6">
      <div className="panel p-8 max-w-lg text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-status-bad flex items-center justify-center mx-auto mb-4 text-2xl">!</div>
        <h1 className="text-lg font-bold tracking-tight mb-2">Cannot reach the Helio server</h1>
        <p className="text-[12px] text-dash-muted mb-1">{message}</p>
        <p className="text-[11px] text-dash-muted mb-6">
          Start the API with <span className="font-mono bg-black/5 px-1.5 py-0.5 rounded">npm start</span> in
          {' '}<span className="font-mono">backend</span>, then try again.
        </p>
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded-full bg-black text-white text-[12px] font-bold hover:bg-black/85"
        >
          Retry connection
        </button>
      </div>
    </div>
  );
}

function renderScreen(s: ScreenState) {
  switch (s.name) {
    case 'dashboard':        return <DashboardScreen />;
    case 'calendar':         return <CalendarScreen />;
    case 'reservations':     return <ReservationsScreen />;
    case 'new-reservation':  return <NewReservationScreen reservationId={s.params?.reservationId} />;
    case 'arrivals':         return <ArrivalsScreen />;
    case 'check-in':         return <CheckInScreen reservationId={s.params?.reservationId} />;
    case 'in-house':         return <InHouseScreen />;
    case 'guest-dashboard':  return <GuestDashboardScreen reservationId={s.params?.reservationId} />;
    case 'departures':       return <DeparturesScreen />;
    case 'check-out':        return <CheckOutScreen reservationId={s.params?.reservationId} />;
    case 'cashier':          return <CashierScreen folioId={s.params?.folioId} />;
    case 'housekeeping':     return <HousekeepingScreen />;
    case 'night-audit':      return <NightAuditScreen />;
    case 'inbox':            return <InboxScreen />;
    case 'overbooking':      return <OverbookingScreen />;
    case 'profiles':         return <ProfilesScreen />;
    case 'profile-detail':   return <ProfileDetailScreen profileId={s.params?.profileId} />;
    case 'reports':          return <ReportsScreen />;
    case 'rates-inventory':  return <RatesInventoryScreen />;
    case 'channel-manager':  return <ChannelManagerScreen />;
    case 'groups':           return <GroupsScreen />;
    case 'ar':               return <AccountsReceivableScreen companyId={s.params?.companyId} />;
    case 'config':           return <ConfigurationScreen />;
    case 'admin':            return <AdministrationScreen />;
    default:                 return <DashboardScreen />;
  }
}

function breadcrumbFor(s: ScreenState): { label: string; screen?: ScreenName }[] {
  const map: Record<string, { label: string; screen?: ScreenName }[]> = {
    'dashboard':        [{ label: 'Dashboard' }],
    'calendar':         [{ label: 'Calendar' }],
    'reservations':     [{ label: 'Reservations' }],
    'new-reservation':  [{ label: 'Reservations', screen: 'reservations' }, { label: 'New Reservation' }],
    'arrivals':         [{ label: 'Front Office' }, { label: 'Arrivals' }],
    'check-in':         [{ label: 'Front Office' }, { label: 'Arrivals', screen: 'arrivals' }, { label: 'Check-in' }],
    'in-house':         [{ label: 'Front Office' }, { label: 'In-House' }],
    'guest-dashboard':  [{ label: 'Front Office' }, { label: 'In-House', screen: 'in-house' }, { label: 'Guest' }],
    'departures':       [{ label: 'Front Office' }, { label: 'Departures' }],
    'check-out':        [{ label: 'Front Office' }, { label: 'Departures', screen: 'departures' }, { label: 'Check-out' }],
    'cashier':          [{ label: 'Cashier' }],
    'housekeeping':     [{ label: 'Housekeeping' }],
    'night-audit':      [{ label: 'Night Audit' }],
    'inbox':            [{ label: 'Inbox' }],
    'overbooking':      [{ label: 'Overbooking' }],
    'profiles':         [{ label: 'Profiles' }],
    'profile-detail':   [{ label: 'Profiles', screen: 'profiles' }, { label: 'Guest Profile' }],
    'reports':          [{ label: 'Reports' }],
    'rates-inventory':  [{ label: 'Rates & Inventory' }],
    'channel-manager':  [{ label: 'Channel Manager' }],
    'groups':           [{ label: 'Groups & Blocks' }],
    'ar':               [{ label: 'Accounts Receivable' }],
    'config':           [{ label: 'Configuration' }],
    'admin':            [{ label: 'Administration' }],
  };
  return map[s.name] ?? [{ label: 'Dashboard' }];
}
