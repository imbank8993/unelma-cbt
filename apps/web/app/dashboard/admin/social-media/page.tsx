'use client';

import { InlineSelect } from '@/app/components/ui/inlineselect';
import { Tabs } from '@/app/components/ui/tabs';
import { deleteConfirmDialog } from '@/lib/confirm-dialog';
import {
  deleteSocialDraft, getSocialChannelSettings, getSocialWorkspace, PLATFORM_LABELS, POST_STATUS_LABELS,
  publishSocialPost, reconcileSocialPost, saveSocialChannelSettings, saveSocialDraft, saveSocialSettings,
  syncSocialChannels, syncSocialPost, uploadSocialMediaFile, type ChannelSettings, type SocialChannel, type SocialDraft,
  type SocialPlatform, type SocialPost, type SocialWorkspace,
} from '@/lib/social-media-api';
import { BarChart3, Check, ExternalLink, Facebook, Instagram, KeyRound, Loader2, PenLine, Plus, RefreshCw, Save, Send, Settings2, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { SocialMediaAttachment, SocialMediaPreview, SocialMediaStorage } from './social-media-components';
import './social-media.css';

const EMPTY: SocialWorkspace = { settings: { bufferKeySet: false, organizationId: '', graphVersion: 'v26.0', updatedAt: null }, channels: [], posts: [],
  totals: { published: 0, drafts: 0, measured: 0, views: null, reach: null, interactions: null } };
const NEW_DRAFT: SocialDraft = { platform: 'instagram', channelId: '', caption: '', mediaType: 'image', mediaUrl: '', aiGenerated: false };
const PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'tiktok'];
const formatNumber = (value?: number | null) => value === null || value === undefined ? '—' : value.toLocaleString('id-ID');
const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum diperbarui';
const editable = (post: SocialPost) => ['draft', 'failed'].includes(post.status) && !post.buffer_post_id;
function PlatformIcon({ platform, size = 18 }: { platform: SocialPlatform; size?: number }) {
  return platform === 'instagram' ? <Instagram size={size} /> : platform === 'facebook' ? <Facebook size={size} /> : <Video size={size} />;
}

export default function AdminSocialMediaPage() {
  const [tab, setTab] = useState<'posting' | 'statistics' | 'settings'>('posting');
  const [data, setData] = useState<SocialWorkspace>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<SocialDraft>(NEW_DRAFT);
  const [draftId, setDraftId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState<SocialPlatform | 'all'>('all');
  const [bufferKey, setBufferKey] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [graphVersion, setGraphVersion] = useState('v26.0');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [channelInfo, setChannelInfo] = useState<ChannelSettings | null>(null);
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [referenceValue, setReferenceValue] = useState('');

  const load = useCallback(async (initialize = false) => {
    const result = await getSocialWorkspace();
    if (result.success) {
      setData(result);
      if (initialize) { setOrganizationId(result.settings.organizationId); setGraphVersion(result.settings.graphVersion); }
    } else setNotice({ error: true, text: result.error });
    setLoading(false);
  }, []);
  const pollInFlight = useRef(false);
  const lastSync = useRef(new Map<string, number>());
  const watchedPosts = data.settings.bufferKeySet ? data.posts.filter(post => post.buffer_post_id &&
    (['processing', 'sending', 'uncertain'].includes(post.status) || post.status === 'published' && !post.metrics_at && !post.metrics_error)) : [];
  const watchKey = watchedPosts.map(post => `${post.id}:${post.status}`).join(',');
  useEffect(() => {
    if (!watchKey || busy) return;
    let active = true;
    const watched = watchKey.split(',').map(item => { const [id, status] = item.split(':'); return { id, status }; });
    const check = async () => {
      if (document.hidden || busyRef.current || pollInFlight.current) return;
      const pending = watched.filter(post => Date.now() - (lastSync.current.get(post.id) || 0) >= (post.status === 'published' ? 300000 : 10000))
        .sort((a, b) => (lastSync.current.get(a.id) || 0) - (lastSync.current.get(b.id) || 0)).slice(0, 5);
      if (!pending.length) return;
      pollInFlight.current = true;
      try {
        await Promise.all(pending.map(post => { lastSync.current.set(post.id, Date.now()); return syncSocialPost(post.id); }));
        if (active) await load();
      } catch {
        // Preserve the last snapshot on a background network failure; the next interval retries.
      } finally { pollInFlight.current = false; }
    };
    const initial = window.setTimeout(() => void check(), 500);
    const timer = window.setInterval(() => void check(), watched.some(post => post.status !== 'published') ? 15000 : 300000);
    const onVisible = () => { if (!document.hidden) void check(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [watchKey, busy, load]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedChannel) return;
    let active = true;
    void getSocialChannelSettings(selectedChannel).then(result => {
      if (!active) return;
      if (result.success) {
        setChannelInfo(result); setAccountId(result.accountId);
        if (result.credentialsUnreadable) setNotice({ error: true, text: 'Token lama belum dapat dibuka. Masukkan kembali access token akun ini, lalu simpan.' });
      }
      else setNotice({ error: true, text: result.error });
    });
    return () => { active = false; };
  }, [selectedChannel]);

  function selectChannel(id: string) {
    setSelectedChannel(id); setChannelInfo(null); setAccessToken(''); setRefreshToken('');
    setClientKey(''); setClientSecret(''); setAccountId('');
  }

  async function run(name: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(name); setNotice(null);
    try { await action(); }
    catch { setNotice({ error: true, text: 'Permintaan belum dapat diselesaikan. Periksa koneksi lalu coba lagi.' }); }
    finally { busyRef.current = false; setBusy(''); }
  }
  async function saveDraft(publish = false) {
    await run(publish ? 'publish' : 'draft', async () => {
      const id = draftId || crypto.randomUUID();
      // ID dipertahankan walaupun respons hilang: simpan ulang tidak membuat draf kedua.
      setDraftId(id);
      const result = await saveSocialDraft(id, draft);
      if (!result.success) { setNotice({ error: true, text: result.error }); return; }
      if (publish) {
        const sent = await publishSocialPost(id);
        if (!sent.success) setNotice({ error: true, text: `${sent.error} Draf sudah tersimpan. Perbarui riwayat untuk memeriksa status sebelum mengirim ulang.` });
        else {
          setNotice({ error: ['failed', 'uncertain'].includes(sent.post.status), text: sent.post.error ||
            (sent.post.status === 'published' ? 'Posting berhasil terbit.' : 'Posting sudah diterima Buffer. Perbarui status untuk memantau publikasinya.') });
          if (!editable(sent.post)) { setDraft({ ...NEW_DRAFT }); setDraftId(''); }
        }
      } else setNotice({ error: false, text: 'Draf tersimpan.' });
      await load();
    });
  }
  async function uploadFile(file: File) {
    let uploaded = false;
    await run('upload', async () => {
      setUploadProgress(0);
      const result = await uploadSocialMediaFile(file, setUploadProgress);
      if (!result.success) { setNotice({ error: true, text: result.error }); return; }
      setDraft(current => ({ ...current, mediaUrl: result.media.url, mediaType: result.media.mediaType }));
      uploaded = true;
      setNotice({ error: false, text: 'File berhasil diunggah. Simpan draf atau publikasikan setelah memeriksa pratinjau.' });
    });
    return uploaded;
  }
  async function refreshPost(post: SocialPost) {
    await run(post.id, async () => {
      const result = await syncSocialPost(post.id);
      setNotice(result.success ? { error: Boolean(result.post.metrics_error || result.post.error), text: result.post.metrics_error || result.post.error ||
        (result.post.status === 'published' ? result.post.metrics_at ? 'Status dan statistik diperbarui.' : 'Posting sudah terbit. Statistik belum tersedia; data Buffer dapat membutuhkan hingga 24 jam.' : 'Status posting diperbarui. Publikasi masih diproses oleh Buffer.') } : { error: true, text: result.error });
      await load();
    });
  }
  async function refreshRecent(name: 'reload' | 'metrics') {
    await run(name, async () => {
      const latest = await getSocialWorkspace();
      if (!latest.success) { setNotice({ error: true, text: latest.error }); return; }
      const candidates = latest.posts.filter(post => post.buffer_post_id &&
        (name === 'reload' || filter === 'all' || post.platform === filter)).slice(0, 20);
      let unavailable = 0, processing = 0, waiting = 0;
      for (let start = 0; start < candidates.length; start += 3) {
        const responses = await Promise.all(candidates.slice(start, start + 3).map(post => syncSocialPost(post.id)));
        for (const result of responses) {
          if (!result.success || result.post.metrics_error || result.post.error) unavailable++;
          else if (result.post.status !== 'published') processing++;
          else if (!result.post.metrics_at) waiting++;
        }
      }
      await load();
      setNotice({ error: unavailable > 0, text: unavailable ? `${unavailable} posting belum dapat diperbarui. Lihat keterangan masing-masing posting.` :
        `${candidates.length} posting diperiksa.${processing ? ` ${processing} masih diproses Buffer.` : ''}${waiting ? ` ${waiting} sudah terbit dan menunggu statistik; data Buffer dapat membutuhkan hingga 24 jam.` : ''}` });
    });
  }
  async function syncAccounts() {
    await run('channels', async () => {
      const result = await syncSocialChannels();
      if (!result.success) { setNotice({ error: true, text: result.error }); return; }
      setOrganizations(result.organizations);
      setNotice({ error: result.needsOrganization, text: result.needsOrganization ? 'Pilih organisasi Buffer di bawah, simpan pengaturan, lalu sinkronkan kembali.' : `${result.count || 0} akun disinkronkan.` });
      if (!result.needsOrganization) await load(true);
    });
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    await run('settings', async () => {
      const result = await saveSocialSettings({ ...(bufferKey.trim() ? { bufferApiKey: bufferKey.trim() } : {}), organizationId, graphVersion });
      if (!result.success) { setNotice({ error: true, text: result.error }); return; }
      setBufferKey(''); setNotice({ error: false, text: 'Pengaturan disimpan. Sinkronkan akun untuk memeriksa koneksi Buffer.' }); await load();
    });
  }
  async function saveToken(event: FormEvent) {
    event.preventDefault();
    if (!selectedChannel) return;
    const id = selectedChannel;
    await run('token', async () => {
      const result = await saveSocialChannelSettings(id, { accountId,
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}), ...(refreshToken.trim() ? { refreshToken: refreshToken.trim() } : {}),
        ...(clientKey.trim() ? { clientKey: clientKey.trim() } : {}), ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) });
      if (!result.success) { setNotice({ error: true, text: result.error }); return; }
      setAccessToken(''); setRefreshToken(''); setClientKey(''); setClientSecret('');
      const info = await getSocialChannelSettings(id); if (info.success) setChannelInfo(info);
      setNotice({ error: false, text: 'Token statistik disimpan. Gunakan Perbarui pada posting terbit untuk memeriksanya.' }); await load();
    });
  }
  async function saveReference(post: SocialPost) {
    await run('reference', async () => {
      const result = await reconcileSocialPost(post.id, post.status === 'published' ? { externalPostId: referenceValue } : { bufferPostId: referenceValue });
      setNotice(result.success ? { error: false, text: 'Referensi posting diperbarui.' } : { error: true, text: result.error });
      if (result.success) { setReferenceId(''); setReferenceValue(''); await load(); }
    });
  }
  function edit(post: SocialPost) {
    setDraftId(post.id); setDraft({ platform: post.platform, channelId: post.channel_id || '', caption: post.caption,
      mediaType: post.media_type, mediaUrl: post.media_url || '', aiGenerated: post.ai_generated }); setTab('posting');
    document.getElementById('social-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const channels = data.channels.filter(channel => channel.platform === draft.platform && channel.connected);
  const account = data.channels.find(channel => channel.id === selectedChannel);
  const target = data.channels.find(channel => channel.id === draft.channelId);
  const posts = data.posts.filter(post => filter === 'all' || post.platform === filter);
  const published = posts.filter(post => post.status === 'published');
  const canPublish = Boolean(data.settings.bufferKeySet && draft.channelId && target?.connected && (draft.mediaType === 'text' ? draft.caption.trim() : draft.mediaUrl.trim()));

  return <div className="social-page max-w-7xl mx-auto pb-20">
    <div className="social-toolbar">
      <Tabs ariaLabel="Media Sosial" activeTab={tab} onSelect={setTab} tabs={[
        { key: 'posting', label: 'Posting', icon: <PenLine size={16} /> }, { key: 'statistics', label: 'Statistik', icon: <BarChart3 size={16} /> },
        { key: 'settings', label: 'Pengaturan', icon: <Settings2 size={16} /> },
      ]} />
      <button className="social-icon-button social-reload" title="Perbarui status dan statistik" aria-label="Perbarui halaman" disabled={Boolean(busy) || loading} onClick={() => void refreshRecent('reload')}><RefreshCw size={16} className={busy === 'reload' ? 'animate-spin' : ''} /></button>
    </div>
    {tab === 'statistics' && <div className="social-summary">
      {[{ label: 'Posting terbit', value: data.totals.published, note: `${data.totals.drafts} draf tersimpan` },
        { label: 'Tayangan', value: data.totals.views, note: 'Akumulasi tayangan posting' },
        { label: 'Jangkauan / pemirsa unik', value: data.totals.reach, note: 'Akumulasi per posting' },
        { label: 'Interaksi', value: data.totals.interactions, note: `${data.totals.measured} posting memiliki statistik` }].map(item =>
        <div className="social-stat" key={item.label}><span>{item.label}</span><strong>{loading ? '…' : formatNumber(item.value)}</strong><small>{item.note}</small></div>)}
    </div>}
    {notice && <div className={`social-notice ${notice.error ? 'is-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
    {!loading && !data.settings.bufferKeySet && tab !== 'settings' && <p className="social-connection-note"><KeyRound size={15} /><span>Hubungkan akun melalui <button type="button" aria-label="Buka pengaturan" onClick={() => setTab('settings')}>Pengaturan</button> untuk mempublikasikan. Anda tetap dapat menyimpan draf.</span></p>}

    {tab === 'posting' && <>
      <div className="social-compose-grid" id="social-composer">
        <section className="social-card">
          <div className="social-section-title"><div><h2>{draftId ? 'Edit draf' : 'Buat posting'}</h2><p>Satu posting untuk satu akun tujuan.</p></div><button className="social-text-button" disabled={Boolean(busy)} onClick={() => { setDraft({ ...NEW_DRAFT }); setDraftId(''); }}><Plus size={15} />Draf baru</button></div>
          <form onSubmit={event => { event.preventDefault(); void saveDraft(); }}>
            <fieldset disabled={Boolean(busy)} className="social-fieldset">
              <div className="social-platforms" aria-label="Platform tujuan">{PLATFORMS.map(platform => <button key={platform} type="button" aria-pressed={draft.platform === platform} onClick={() => setDraft({ ...draft, platform, channelId: '', mediaType: draft.mediaType === 'text' && platform !== 'facebook' ? 'image' : draft.mediaType })} className={draft.platform === platform ? 'selected' : ''}><PlatformIcon platform={platform} />{PLATFORM_LABELS[platform]}</button>)}</div>
              <label>Akun tujuan<InlineSelect aria-label="Akun tujuan" minWidth="0" height="42px" value={draft.channelId} onChange={value => setDraft({ ...draft, channelId: value })} options={[{ value: '', label: channels.length ? 'Pilih akun' : 'Belum ada akun terhubung' }, ...channels.map(channel => ({ value: channel.id, label: channel.name }))]} /></label>
              <label>Caption<textarea rows={5} maxLength={2200} value={draft.caption} onChange={event => setDraft({ ...draft, caption: event.target.value })} placeholder="Tulis informasi, ajakan, dan hashtag…" /><span className="social-input-note">{draft.caption.length}/2.200 karakter</span></label>
              <label>Jenis konten<InlineSelect aria-label="Jenis konten" minWidth="0" height="42px" value={draft.mediaType} onChange={value => setDraft({ ...draft, mediaType: value as SocialDraft['mediaType'], mediaUrl: '' })} options={[...(draft.platform === 'facebook' ? [{ value: 'text', label: 'Teks / tautan dalam caption' }] : []), { value: 'image', label: 'Gambar' }, { value: 'video', label: draft.platform === 'instagram' ? 'Video / Reel' : 'Video' }]} /></label>
              {draft.mediaType !== 'text' && <SocialMediaAttachment key={`${draftId}:${draft.mediaType}`} value={draft.mediaUrl} mediaType={draft.mediaType} disabled={Boolean(busy)} uploading={busy === 'upload'} progress={uploadProgress} onChange={mediaUrl => setDraft({ ...draft, mediaUrl })} onUpload={uploadFile} onError={text => setNotice({ error: true, text })} />}
              {(draft.platform === 'instagram' || (draft.platform === 'tiktok' && draft.mediaType === 'video')) && <label className="social-checkbox"><input type="checkbox" checked={draft.aiGenerated} onChange={event => setDraft({ ...draft, aiGenerated: event.target.checked })} />Konten dibuat dengan AI</label>}
              <div className="social-form-actions"><button type="submit" className="social-button secondary"><Save size={16} />Simpan draf</button><button type="button" className="social-button primary" disabled={!canPublish} onClick={() => void saveDraft(true)}>{busy === 'publish' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Publikasikan sekarang</button></div>
              <p className="social-input-note">Posting dikirim melalui Buffer. Status publikasi diperbarui otomatis selama halaman ini terbuka.</p>
            </fieldset>
          </form>
        </section>
        <aside className="social-card social-preview"><div className="social-section-title"><h2>Pratinjau</h2><span>Perkiraan tampilan</span></div><div className="social-preview-profile"><span className={`social-platform-badge ${draft.platform}`}><PlatformIcon platform={draft.platform} size={22} /></span><div><strong>{target?.name || PLATFORM_LABELS[draft.platform]}</strong><small>{target ? 'Akun tujuan' : 'Pilih akun sebelum mempublikasikan'}</small></div></div>
          {draft.mediaType !== 'text' && <SocialMediaPreview key={`${draft.mediaType}:${draft.mediaUrl}`} url={draft.mediaUrl} mediaType={draft.mediaType} />}
          <p className={`social-preview-caption ${draft.caption ? '' : 'is-placeholder'}`}>{draft.caption || 'Caption posting Anda akan muncul di sini.'}</p>
        </aside>
      </div>
      <section className="social-card social-history"><div className="social-section-title"><div><h2>Riwayat posting</h2><p>100 posting terbaru yang dibuat dari Unelma.</p></div><InlineSelect className="social-filter-select" aria-label="Filter platform" minWidth="0" height="40px" value={filter} onChange={value => setFilter(value as typeof filter)} options={[{ value: 'all', label: 'Semua platform' }, ...PLATFORMS.map(platform => ({ value: platform, label: PLATFORM_LABELS[platform] }))]} /></div>
        {loading ? <div className="social-empty"><Loader2 className="animate-spin" />Memuat posting…</div> : !posts.length ? <div className="social-empty"><PenLine size={28} /><h3>Belum ada posting</h3><p>Siapkan caption dan media, lalu simpan draf pertama Anda.</p></div> : <div className="social-post-list">{posts.map(post => <article className="social-post-row" key={post.id}>
          <span className={`social-platform-badge ${post.platform}`}><PlatformIcon platform={post.platform} /></span><div className="social-post-main"><div className="social-post-title"><strong>{data.channels.find(channel => channel.id === post.channel_id)?.name || PLATFORM_LABELS[post.platform]}</strong><span className={`social-status ${post.status}`}>{POST_STATUS_LABELS[post.status]}</span></div><p>{post.caption || '(Posting media tanpa caption)'}</p><small>{formatTime(post.created_at)}</small>{post.error && <div className="social-inline-error">{post.error}</div>}{['uncertain', 'sending'].includes(post.status) && <p className="social-input-note">Periksa Buffer sebelum membuat pengiriman baru. Jika posting sudah ada, hubungkan ID posting Buffer.</p>}
            {referenceId === post.id && <div className="social-reference"><label>{post.status === 'published' ? 'ID posting asli di platform' : 'ID posting di Buffer'}<input value={referenceValue} onChange={event => setReferenceValue(event.target.value)} maxLength={160} placeholder={post.status === 'published' ? 'ID numerik, bukan URL atau ID Buffer' : 'ID posting yang ditemukan di Buffer'} /></label><button className="social-button secondary" disabled={Boolean(busy) || !referenceValue.trim()} onClick={() => void saveReference(post)}>Simpan ID</button><button className="social-text-button" onClick={() => setReferenceId('')}>Batal</button></div>}
          </div><div className="social-post-actions">
            {editable(post) && <><button className="social-icon-button" title="Edit draf" aria-label="Edit draf" disabled={Boolean(busy)} onClick={() => edit(post)}><PenLine size={16} /></button><button className="social-icon-button danger" title="Hapus draf" aria-label="Hapus draf" disabled={Boolean(busy)} onClick={() => void run(post.id, async () => { if (!await deleteConfirmDialog('Hapus draf?', 'Draf ini akan dihapus dari Unelma.')) return; const result = await deleteSocialDraft(post.id); if (!result.success) setNotice({ error: true, text: result.error }); await load(); })}><Trash2 size={16} /></button></>}
            {post.buffer_post_id && <button className="social-icon-button" aria-label="Perbarui posting" title="Perbarui status dan statistik" disabled={Boolean(busy)} onClick={() => void refreshPost(post)}><RefreshCw size={16} className={busy === post.id ? 'animate-spin' : ''} /></button>}
            {(post.status === 'published' || ['uncertain', 'sending'].includes(post.status)) && <button className="social-text-button" disabled={Boolean(busy)} onClick={() => { setReferenceId(post.id); setReferenceValue(post.external_post_id || ''); }}>Atur ID</button>}
            {post.external_url && <a className="social-icon-button" href={post.external_url} target="_blank" rel="noopener noreferrer" title="Buka posting" aria-label="Buka posting"><ExternalLink size={16} /></a>}
            {post.buffer_post_id && post.status !== 'published' && <a className="social-text-button" href="https://publish.buffer.com/" target="_blank" rel="noopener noreferrer">Buka Buffer</a>}
          </div>
        </article>)}</div>}
      </section>
    </>}

    {tab === 'statistics' && <section className="social-card"><div className="social-section-title"><div><h2>Performa posting</h2><p>Data dari Buffer, atau langsung dari platform jika token statistik diisi.</p></div><button className="social-button secondary" disabled={Boolean(busy) || !posts.some(post => post.buffer_post_id)} onClick={() => void refreshRecent('metrics')}><RefreshCw size={16} className={busy === 'metrics' ? 'animate-spin' : ''} />Perbarui 20 terbaru</button></div>
      <label className="social-metrics-filter">Platform statistik<InlineSelect aria-label="Platform statistik" minWidth="0" height="42px" value={filter} onChange={value => setFilter(value as typeof filter)} options={[{ value: 'all', label: 'Semua platform' }, ...PLATFORMS.map(platform => ({ value: platform, label: PLATFORM_LABELS[platform] }))]} /></label>
      <p className="social-input-note social-metrics-note">Statistik Buffer dapat membutuhkan hingga 24 jam setelah publikasi. Tayangan memakai views atau impressions yang tersedia; keduanya tidak dijumlahkan. Jangkauan adalah akumulasi per posting, bukan orang unik lintas posting. TikTok tidak menyediakan jangkauan unik pada integrasi ini. Tanda — berarti data belum tersedia, bukan nol.</p>
      {!published.length ? <div className="social-empty"><BarChart3 size={30} /><h3>{posts.some(post => post.buffer_post_id) ? 'Status publikasi sedang diperiksa' : 'Statistik muncul setelah posting terbit'}</h3><p>Gunakan Perbarui 20 terbaru untuk memeriksa status dan statistik di Buffer.</p></div> : <div className="social-table-scroll"><table className="social-table"><thead><tr><th>Posting</th><th>Tayangan</th><th>Jangkauan / unik</th><th>Interaksi</th><th>Diperbarui</th></tr></thead><tbody>{published.map(post => <tr key={post.id}><td><span className="social-table-platform"><PlatformIcon platform={post.platform} size={15} />{PLATFORM_LABELS[post.platform]}</span><p>{post.caption || 'Posting media'}</p>{post.metrics_error ? <small className="social-inline-error">{post.metrics_error}</small> : !post.metrics_at && <small>Posting sudah terbit. Menunggu statistik dari platform atau Buffer.</small>}</td><td>{formatNumber(post.metrics.views)}</td><td>{formatNumber(post.metrics.reach)}</td><td>{formatNumber(post.metrics.interactions)}</td><td><small>{formatTime(post.metrics_at)}{post.metrics.source && <><br />{post.metrics.source === 'buffer' ? 'Buffer' : PLATFORM_LABELS[post.platform]}</>}</small></td></tr>)}</tbody></table></div>}
    </section>}

    {tab === 'settings' && <div className="social-settings-grid">
      <section className="social-card"><div className="social-section-title"><div><h2>Publikasi melalui Buffer</h2><p>API key disimpan terenkripsi. Kolom kosong mempertahankan key yang sudah tersimpan.</p></div><KeyRound size={20} /></div>
        <ol className="social-steps"><li>Hubungkan akun Instagram profesional, Facebook Page, dan TikTok ke Buffer.</li><li>Buat API key Buffer, isi di bawah, lalu simpan.</li><li>Sinkronkan akun untuk mulai mempublikasikan dari Unelma.</li></ol>
        <div className="social-help-links"><a href="https://publish.buffer.com/" target="_blank" rel="noopener noreferrer">Kelola akun Buffer <ExternalLink size={13} /></a><a href="https://developers.buffer.com/guides/getting-started.html" target="_blank" rel="noopener noreferrer">Panduan API key <ExternalLink size={13} /></a></div>
        <form onSubmit={event => void saveSettings(event)}><fieldset className="social-fieldset" disabled={Boolean(busy)}><label>API key Buffer <span className="social-field-state">{data.settings.bufferKeySet ? 'Sudah tersimpan' : 'Belum diisi'}</span><input type="password" autoComplete="new-password" value={bufferKey} onChange={event => setBufferKey(event.target.value)} placeholder={data.settings.bufferKeySet ? 'Isi hanya untuk mengganti API key' : 'Masukkan API key Buffer'} maxLength={12000} /></label>
          <label>Organisasi Buffer{organizations.length ? <InlineSelect aria-label="Organisasi Buffer" minWidth="0" height="42px" value={organizationId} onChange={setOrganizationId} options={[{ value: '', label: 'Pilih organisasi' }, ...organizations.map(org => ({ value: org.id, label: org.name }))]} /> : <input value={organizationId} onChange={event => setOrganizationId(event.target.value)} maxLength={160} placeholder="Terisi otomatis jika hanya ada satu organisasi" />}<span className="social-input-note">Jika memiliki beberapa organisasi, klik Sinkronkan akun untuk memuat pilihan.</span></label>
          <div className="social-form-actions"><button className="social-button primary" type="submit"><Save size={16} />Simpan pengaturan</button><button type="button" className="social-button secondary" disabled={!data.settings.bufferKeySet} onClick={() => void syncAccounts()}><RefreshCw size={16} className={busy === 'channels' ? 'animate-spin' : ''} />Sinkronkan akun</button></div>
        </fieldset></form>
        {data.settings.bufferKeySet && <button className="social-text-button danger social-remove" disabled={Boolean(busy)} onClick={() => void run('remove-key', async () => { if (!await deleteConfirmDialog('Hapus API key Buffer?', 'Publikasi dari Unelma dinonaktifkan sampai API key diisi kembali. Riwayat posting tetap tersimpan.')) return; const result = await saveSocialSettings({ clearBufferKey: true }); if (!result.success) setNotice({ error: true, text: result.error }); else { setBufferKey(''); setNotice({ error: false, text: 'API key Buffer dihapus.' }); await load(); } })}>Hapus API key tersimpan</button>}
      </section>
      <section className="social-card"><div className="social-section-title"><div><h2>Statistik akun</h2><p>Opsional: isi token platform untuk membaca statistik langsung. Tanpa token ini, aplikasi mencoba statistik melalui API key Buffer.</p></div><BarChart3 size={20} /></div>
        <form onSubmit={event => void saveToken(event)}><fieldset className="social-fieldset" disabled={Boolean(busy)}>
          <label>Akun statistik<InlineSelect aria-label="Akun statistik" minWidth="0" height="42px" value={selectedChannel} onChange={selectChannel} options={[{ value: '', label: 'Pilih akun yang sudah disinkronkan' }, ...data.channels.map(channel => ({ value: channel.id, label: `${PLATFORM_LABELS[channel.platform]} · ${channel.name}` }))]} /></label>
          {account && !channelInfo && <p className="social-input-note">Memuat pengaturan akun…</p>}
          {account && channelInfo && <>
            <div className="social-token-status"><Check size={15} />{channelInfo.tokenSet ? 'Token statistik sudah tersimpan' : 'Token statistik belum diisi'}</div>
            {account.platform !== 'tiktok' && <label>ID {account.platform === 'instagram' ? 'akun Instagram profesional' : 'Facebook Page'}<input value={accountId} onChange={event => setAccountId(event.target.value)} maxLength={160} /><span className="social-input-note">Gunakan ID numerik akun yang sama dengan tujuan posting Buffer.</span></label>}
            <label>Access token {PLATFORM_LABELS[account.platform]}<input type="password" autoComplete="new-password" value={accessToken} onChange={event => setAccessToken(event.target.value)} placeholder={channelInfo.tokenSet ? 'Kosongkan untuk mempertahankan token' : 'Masukkan access token platform'} maxLength={12000} /></label>
            {account.platform === 'tiktok' ? <><p className="social-input-note">Token memerlukan izin video.list. Isi opsi berikut untuk memperbarui token otomatis; jika dikosongkan, ganti access token saat kedaluwarsa.</p>
              <label>Refresh token (opsional)<input type="password" autoComplete="new-password" value={refreshToken} onChange={event => setRefreshToken(event.target.value)} placeholder={channelInfo.refreshTokenSet ? 'Sudah tersimpan; isi untuk mengganti' : 'Refresh token TikTok'} maxLength={12000} /></label>
              <label>Client key TikTok (opsional)<input type="password" autoComplete="new-password" value={clientKey} onChange={event => setClientKey(event.target.value)} placeholder={channelInfo.clientKeySet ? 'Sudah tersimpan; isi untuk mengganti' : 'Client key'} maxLength={12000} /></label>
              <label>Client secret TikTok (opsional)<input type="password" autoComplete="new-password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} placeholder={channelInfo.clientSecretSet ? 'Sudah tersimpan; isi untuk mengganti' : 'Client secret'} maxLength={12000} /></label>
              <a className="social-help-link" href="https://developers.tiktok.com/docs/en/display-api-get-started" target="_blank" rel="noopener noreferrer">Panduan token TikTok <ExternalLink size={13} /></a>
            </> : <><p className="social-input-note">{account.platform === 'instagram' ? 'Gunakan Facebook User access token dengan izin instagram_basic, instagram_manage_insights, serta pages_read_engagement (Instagram API with Facebook Login).' : 'Gunakan Page access token dengan izin read_insights serta pages_read_engagement untuk Page ini.'}</p><a className="social-help-link" href="https://developers.facebook.com/docs/insights/overview/" target="_blank" rel="noopener noreferrer">Panduan Meta Insights <ExternalLink size={13} /></a></>}
            <div className="social-form-actions"><button type="submit" className="social-button primary"><Save size={16} />Simpan token statistik</button>{channelInfo.tokenSet && <button type="button" className="social-button secondary danger" onClick={() => void run('remove-token', async () => { if (!await deleteConfirmDialog('Hapus token statistik?', 'Pembaruan statistik akun ini dihentikan sampai token diisi kembali.')) return; const result = await saveSocialChannelSettings(selectedChannel, { clearCredentials: true }); if (!result.success) setNotice({ error: true, text: result.error }); else { const info = await getSocialChannelSettings(selectedChannel); if (info.success) setChannelInfo(info); setAccessToken(''); setRefreshToken(''); setClientKey(''); setClientSecret(''); await load(); } })}>Hapus token</button>}</div>
          </>}
        </fieldset></form>
      </section>
      <SocialMediaStorage disabled={Boolean(busy)} onNotice={setNotice} />
      <section className="social-card social-accounts"><div className="social-section-title"><div><h2>Akun terhubung</h2><p>Status diperbarui saat sinkronisasi Buffer.</p></div></div><div className="social-account-list">{data.channels.length ? data.channels.map(channel => <ChannelCard channel={channel} key={channel.id} />) : <p className="social-input-note">Belum ada akun. Simpan API key dan sinkronkan akun Buffer.</p>}</div>
        <form className="social-version" onSubmit={event => { event.preventDefault(); void run('version', async () => { const result = await saveSocialSettings({ graphVersion }); setNotice(result.success ? { error: false, text: 'Versi Graph API disimpan.' } : { error: true, text: result.error }); await load(); }); }}><label>Versi Meta Graph API<input value={graphVersion} onChange={event => setGraphVersion(event.target.value)} pattern="v[0-9]{2}\.0" maxLength={10} /></label><button className="social-button secondary" disabled={Boolean(busy)}>Simpan versi</button></form>
      </section>
    </div>}
  </div>;
}

function ChannelCard({ channel }: { channel: SocialChannel }) {
  return <div className="social-account"><span className={`social-platform-badge ${channel.platform}`}><PlatformIcon platform={channel.platform} /></span><div><strong>{channel.name}</strong><small>{PLATFORM_LABELS[channel.platform]} · {channel.connected ? 'Publikasi terhubung' : 'Perlu sinkronisasi / hubungkan ulang'} · {channel.tokenSet ? 'Token statistik platform tersimpan' : 'Statistik melalui Buffer'}</small></div></div>;
}
