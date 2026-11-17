'use client';

import { HardDrive, ImageIcon, Loader2, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { deleteConfirmDialog } from '@/lib/confirm-dialog';
import { cleanupSocialStorage, getSocialStorageUsage, type SocialStorageUsage } from '@/lib/social-media-api';

export function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
}

export function SocialMediaAttachment({ value, mediaType, disabled, uploading, progress, onChange, onUpload, onError }: {
  value: string; mediaType: 'image' | 'video'; disabled: boolean; uploading: boolean; progress: number;
  onChange: (url: string) => void; onUpload: (file: File) => Promise<boolean>; onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'upload' | 'url'>(value && !value.includes('/api/social-media/media/') ? 'url' : 'upload');
  const [name, setName] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isVideo = mediaType === 'video';
  const description = isVideo ? 'MP4 · maksimal 25 MB' : 'JPG atau PNG · maksimal 8 MB';
  async function choose(file?: File) {
    if (!file || disabled) return;
    if (!(isVideo ? /\.mp4$/i : /\.(jpe?g|png)$/i).test(file.name)) { onError(`Pilih ${isVideo ? 'video MP4' : 'gambar JPG atau PNG'}.`); return; }
    if (file.size > (isVideo ? 25 : 8) * 1024 * 1024) { onError(`Ukuran ${isVideo ? 'video maksimal 25 MB' : 'gambar maksimal 8 MB'}.`); return; }
    setPendingName(file.name);
    if (await onUpload(file)) setName(file.name);
  }
  return <div className="social-attachment">
    <div className="social-attachment-heading"><span>Lampiran {isVideo ? 'video' : 'gambar'}</span><div className="social-source-switch" aria-label="Sumber lampiran">
      <button type="button" aria-pressed={mode === 'upload'} disabled={disabled} onClick={() => setMode('upload')}>Unggah file</button>
      <button type="button" aria-pressed={mode === 'url'} disabled={disabled} onClick={() => setMode('url')}>Gunakan URL</button>
    </div></div>
    {mode === 'url' ? <label><span className="social-sr-only">URL media publik</span><input type="url" value={value} maxLength={2048} onChange={event => onChange(event.target.value)} placeholder="https://…" /><span className="social-input-note">Tautan langsung HTTPS ke file yang dapat dibuka tanpa login.</span></label> : <>
      <input ref={input} type="file" className="social-sr-only" tabIndex={-1} accept={isVideo ? 'video/mp4,.mp4' : 'image/jpeg,image/png,.jpg,.jpeg,.png'} aria-label={isVideo ? 'Unggah video' : 'Unggah gambar'} disabled={disabled}
        onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
      {value && !uploading ? <div className="social-file-ready"><span className="social-file-icon">{isVideo ? <Video size={20} /> : <ImageIcon size={20} />}</span><div><strong>{name || (isVideo ? 'Video terlampir' : 'Gambar terlampir')}</strong><span>Siap digunakan · <button type="button" disabled={disabled} onClick={() => input.current?.click()}>Ganti file</button></span></div><button type="button" className="social-icon-button" disabled={disabled} aria-label="Hapus lampiran" onClick={() => { onChange(''); setName(''); }}><X size={16} /></button></div> :
        <button type="button" className={`social-upload-zone ${dragging ? 'is-dragging' : ''}`} disabled={disabled} onClick={() => input.current?.click()}
          onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]); }}>
          <span className="social-upload-icon">{uploading ? <Loader2 size={23} className="animate-spin" /> : <Upload size={23} />}</span>
          <strong>{uploading ? progress === 100 ? 'Menyimpan file…' : `Mengunggah ${progress}%` : 'Pilih file dari perangkat'}</strong><span>{uploading ? pendingName : 'atau tarik dan letakkan di sini'}</span><small>{description}</small>
        </button>}
      {uploading && <progress className="social-upload-progress" aria-label="Progres unggahan" value={progress} max={100} />}
      <p className="social-input-note">File disimpan di penyimpanan aplikasi. Anda tidak perlu membuat URL sendiri.</p>
    </>}
  </div>;
}

export function SocialMediaPreview({ url, mediaType }: { url: string; mediaType: 'image' | 'video' }) {
  const [failed, setFailed] = useState(false);
  return <div className={`social-preview-media ${!url || failed ? 'is-empty' : ''}`}>
    {!url || failed ? <div>{mediaType === 'image' ? <ImageIcon size={30} /> : <Video size={30} />}<span>{failed ? 'Media belum dapat ditampilkan' : 'Pratinjau media'}</span><small>{failed ? 'Periksa file atau tautan lampiran.' : 'Unggah file untuk melihat tampilannya.'}</small></div> : mediaType === 'image' ?
      /* eslint-disable-next-line @next/next/no-img-element -- Admin preview supports uploaded files and external media. */
      <img src={url} alt="Pratinjau gambar posting" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> :
      <video src={url} controls preload="metadata" onError={() => setFailed(true)} />}
  </div>;
}

export function SocialMediaStorage({ disabled, onNotice }: { disabled: boolean; onNotice: (notice: { error: boolean; text: string }) => void }) {
  const [usage, setUsage] = useState<SocialStorageUsage | null>(null);
  const [busy, setBusy] = useState(false);
  async function check(cleanup = false) {
    if (busy || disabled) return;
    setBusy(true);
    try {
      if (cleanup) {
        if (!await deleteConfirmDialog('Bersihkan media tidak terpakai?', 'Hanya unggahan lebih dari 24 jam yang tidak digunakan di draf atau riwayat posting yang dihapus.')) return;
        const result = await cleanupSocialStorage();
        if (!result.success) { onNotice({ error: true, text: result.error }); return; }
        onNotice({ error: result.failed > 0, text: `${result.deleted} file dihapus, ${formatBytes(result.freedBytes)} dibebaskan.${result.failed ? ` ${result.failed} file belum berhasil dihapus.` : ''}` });
      }
      const result = await getSocialStorageUsage();
      if (result.success) setUsage(result.storage); else onNotice({ error: true, text: result.error });
    } catch { onNotice({ error: true, text: 'Pemakaian penyimpanan belum dapat diperiksa.' }); }
    finally { setBusy(false); }
  }
  return <section className="social-card social-storage"><div className="social-section-title"><div><h2>Penyimpanan media</h2><p>Pantau ruang yang digunakan lampiran Media Sosial.</p></div><HardDrive size={20} /></div>
    {usage && <div className="social-storage-stats"><div><span>Digunakan{usage.truncated ? ' (sebagian)' : ''}</span><strong>{formatBytes(usage.bytes)}</strong><small>{usage.files} file</small></div><div><span>Dapat dibersihkan</span><strong>{formatBytes(usage.unusedBytes)}</strong><small>{usage.unusedFiles} file tidak terpakai</small></div></div>}
    <p className="social-input-note">Unggahan memakai kuota R2 aplikasi. Pembersihan hanya menghapus file tidak terpakai yang berumur lebih dari 24 jam. Lampiran draf dan riwayat posting tetap disimpan.</p>
    <div className="social-form-actions"><button type="button" className="social-button secondary" disabled={busy || disabled} onClick={() => void check()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Periksa pemakaian</button><button type="button" className="social-button secondary danger" disabled={busy || disabled || !usage?.unusedFiles || usage.truncated} onClick={() => void check(true)}><Trash2 size={16} />Bersihkan media</button></div>
  </section>;
}
