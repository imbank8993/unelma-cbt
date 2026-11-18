'use client';

import { Bell, CheckCheck, ClipboardList, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserNotificationsResult, markAllNotificationsRead, markNotificationRead } from '@/lib/api/notifications';
import { getNotificationTimeAgo, type Notification } from '@/app/types/notification';
import { safeNotificationUrl } from '@/lib/notification-safety';
import './notification-bell.css';

export default function NotificationBell() {
    const router = useRouter();
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [working, setWorking] = useState('');
    const wrapper = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const mounted = useRef(false);
    const inFlight = useRef(false);
    const reading = useRef(false);
    const version = useRef(0);

    const load = useCallback(async () => {
        if (inFlight.current || reading.current || document.hidden) return;
        const request = ++version.current;
        inFlight.current = true;
        try {
            const result = await getUserNotificationsResult({ limit: 20 });
            if (!mounted.current || request !== version.current) return;
            if (result.success) {
                setNotifications(result.notifications);
                setUnread(result.unreadCount ?? result.notifications.filter(item => !item.is_read).length);
                setError('');
            } else setError(result.error);
        } catch { if (mounted.current) setError('Notifikasi belum dapat dimuat. Coba lagi.'); }
        finally { inFlight.current = false; if (mounted.current) setLoading(false); }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const pendingVersion = version;
        const initial = window.setTimeout(() => void load(), 0);
        const timer = window.setInterval(() => void load(), 30000);
        const onVisible = () => { if (!document.hidden) void load(); };
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            mounted.current = false; pendingVersion.current++;
            window.clearTimeout(initial); window.clearInterval(timer);
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open]);

    async function read(notification?: Notification) {
        if (working) return;
        reading.current = true;
        setWorking(notification?.id || 'all');
        // Ignore a count request started before the read action.
        version.current++;
        try {
            const result = notification ? await markNotificationRead(notification.id) : await markAllNotificationsRead();
            if (!mounted.current) return;
            if (!result.success) { setError(result.error); return; }
            setNotifications(current => current.map(item => !notification || item.id === notification.id ? { ...item, is_read: true } : item));
            setUnread(count => notification ? Math.max(0, count - (notification.is_read ? 0 : 1)) : 0);
            setError('');
            if (notification) {
                const destination = safeNotificationUrl(notification.action_url);
                if (destination) { setOpen(false); router.push(destination); }
            }
        } catch { if (mounted.current) setError('Notifikasi belum dapat ditandai dibaca. Coba lagi.'); }
        finally { reading.current = false; if (mounted.current) setWorking(''); }
    }

    return <div className="notification-wrapper" ref={wrapper}>
        <button ref={trigger} type="button" className="header-icon-btn" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
            title="Notifikasi" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId}
            onClick={() => { setOpen(value => !value); if (!open) void load(); }}>
            <Bell size={18} aria-hidden="true" />
            {unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
        </button>
        {open && <div id={panelId} role="dialog" aria-label="Notifikasi" className="notification-panel">
            <div className="notification-panel-heading"><h2>Notifikasi</h2><div>
                <button type="button" aria-label="Perbarui notifikasi" title="Perbarui" onClick={() => void load()} disabled={Boolean(working)}><RefreshCw size={15} /></button>
                <button type="button" aria-label="Tutup notifikasi" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={17} /></button>
            </div></div>
            {error && <p className="notification-panel-error" role="alert">{error}</p>}
            {loading ? <div className="notification-panel-empty" role="status"><Loader2 size={22} className="animate-spin" /><span>Memuat notifikasi…</span></div> : notifications.length ? <ul className="notification-panel-list">
                {notifications.map(item => <li key={item.id}><button type="button" className={item.is_read ? 'is-read' : 'is-unread'} disabled={Boolean(working)} onClick={() => void read(item)}>
                    <span className="notification-item-icon"><ClipboardList size={18} aria-hidden="true" /></span>
                    <span className="notification-item-copy"><strong>{item.title}</strong>{item.message && <span>{item.message}</span>}<small>{getNotificationTimeAgo(item.created_at)}</small></span>
                    {!item.is_read && <span className="notification-unread-dot" aria-label="Belum dibaca" />}
                </button></li>)}
            </ul> : !error && <div className="notification-panel-empty"><Bell size={25} /><span>Belum ada notifikasi</span><small>Ujian baru akan muncul di sini.</small></div>}
            <div className="notification-panel-footer"><small>20 notifikasi terbaru</small><button type="button" disabled={!unread || Boolean(working)} onClick={() => void read()}><CheckCheck size={15} />Tandai semua dibaca</button></div>
        </div>}
    </div>;
}
